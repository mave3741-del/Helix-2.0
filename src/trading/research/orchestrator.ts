import type { ResearchExperiment, ResearchExperimentStore } from './experiment.ts';
import { runWalkForward, type WalkForwardResult, type FittedStrategy } from './walk-forward.ts';
import { nativeBacktest, type Bar } from '../../runtime/tools/trading.ts';
import { evaluateStatisticalEvidence, passesPromotionStatistics } from './statistics.ts';

export interface ResearchPipelineInput {
  experiment: Omit<ResearchExperiment, 'specHash' | 'createdAt' | 'finalizedAt'>;
  bars: Bar[];
  /** Fits a strategy on the supplied training history and returns a predictor that only sees history up to the decision point. */
  fitStrategy: (trainBars: Bar[], stage: 'backtest' | 'out_of_sample' | 'walk_forward', fold?: number) => FittedStrategy;
  replayManifestId: string;
  trainBars: number;
  testBars: number;
  feeBps?: number;
  slippageBps?: number;
  paperEvaluation?: Record<string, number>;
  /** Realized paper-period returns used for statistical promotion evidence. */
  paperReturns?: number[];
  /** Number of materially tested candidates in the research search. */
  candidateCount?: number;
}

export interface ResearchPipelineResult { experimentId: string; replayManifestId: string; backtest: ReturnType<typeof nativeBacktest>; walkForward: WalkForwardResult; finalStage: 'paper' | 'promoted' | 'retired'; }

export async function runResearchToPaperPipeline(store: ResearchExperimentStore, input: ResearchPipelineInput, promotionRule?: (metrics: Record<string, number>) => boolean): Promise<ResearchPipelineResult> {
  if (!input.replayManifestId.trim()) throw new Error('replay_manifest_required');
  const bars=[...input.bars].sort((a,b)=>a.ts-b.ts);
  if (bars.length < 4) throw new Error('research_bars_insufficient');
  const oosStart = Math.max(2, Math.min(bars.length - 1, Math.floor(bars.length * 0.7)));
  const inSampleBars=bars.slice(0,oosStart); const oosBars=bars.slice(oosStart);
  const created = await store.create({ ...input.experiment, stage: 'research', spec: { ...input.experiment.spec, replayManifestId: input.replayManifestId, evaluationBoundaryTs: oosBars[0]?.ts ?? null } });
  const inSampleStrategy=input.fitStrategy(structuredClone(inSampleBars),'backtest');
  const backtest = nativeBacktest(inSampleBars,(_window,index)=>inSampleStrategy(inSampleBars.slice(0,index+1)),input.feeBps??5,input.slippageBps??2);
  await store.transition(created.experimentId,'backtest');
  await store.addEvaluation({evaluationId:`${created.experimentId}:backtest`,experimentId:created.experimentId,phase:'in_sample',windowStart:inSampleBars[0]?.ts??0,windowEnd:inSampleBars.at(-1)?.ts??0,metrics:{netReturn:backtest.netReturn,maxDrawdown:backtest.maxDrawdown,sharpe:backtest.sharpeLike,trades:backtest.trades},passed:Number.isFinite(backtest.netReturn)});
  await store.transition(created.experimentId,'out_of_sample');
  const oosStrategy=input.fitStrategy(structuredClone(inSampleBars),'out_of_sample');
  const oos=nativeBacktest(oosBars,(_window,index)=>oosStrategy([...inSampleBars,...oosBars.slice(0,index+1)]),input.feeBps??5,input.slippageBps??2);
  await store.addEvaluation({evaluationId:`${created.experimentId}:oos`,experimentId:created.experimentId,phase:'out_of_sample',windowStart:oosBars[0]?.ts??0,windowEnd:oosBars.at(-1)?.ts??0,metrics:{netReturn:oos.netReturn,maxDrawdown:oos.maxDrawdown,sharpe:oos.sharpeLike,trades:oos.trades},passed:oosBars.length>0&&Number.isFinite(oos.netReturn)});
  await store.transition(created.experimentId,'walk_forward');
  const walkForward=runWalkForward({bars,trainBars:input.trainBars,testBars:input.testBars,feeBps:input.feeBps,slippageBps:input.slippageBps,fit:(train,fold)=>input.fitStrategy(train,'walk_forward',fold)});
  await store.addEvaluation({evaluationId:`${created.experimentId}:walk-forward`,experimentId:created.experimentId,phase:'walk_forward',windowStart:walkForward.folds[0]?.testStart??0,windowEnd:walkForward.folds.at(-1)?.testEnd??0,metrics:{robustness:walkForward.aggregate.robustness,medianReturn:walkForward.aggregate.medianReturn,worstDrawdown:walkForward.aggregate.worstDrawdown,meanSharpe:walkForward.aggregate.meanSharpe,folds:walkForward.aggregate.folds},passed:walkForward.aggregate.folds>0&&walkForward.aggregate.robustness>=0.5});
  await store.transition(created.experimentId,'paper');
  const paper=input.paperEvaluation??{return:0,sharpe:0,maxDrawdown:0,robustness:walkForward.aggregate.robustness};
  const paperReturns=(input.paperReturns??[]).filter(Number.isFinite);
  const statistical=evaluateStatisticalEvidence({returns:paperReturns,maxDrawdown:Number(paper.maxDrawdown??1),robustness:Number(paper.robustness??0),candidateCount:input.candidateCount});
  const paperMetrics={...paper,tradeCount:statistical.tradeCount,meanReturn:statistical.meanReturn,volatility:statistical.volatility,tStatistic:statistical.tStatistic,significantAt95:statistical.significantAt95?1:0,multipleTestingPenalty:statistical.multipleTestingPenalty,adjustedScore:statistical.adjustedScore};
  const paperPassed=passesPromotionStatistics(statistical);
  await store.addEvaluation({evaluationId:`${created.experimentId}:paper`,experimentId:created.experimentId,phase:'paper',windowStart:Date.now(),windowEnd:Date.now(),metrics:paperMetrics,passed:paperPassed});
  const promoted=promotionRule?promotionRule(paperMetrics)&&paperPassed:paperPassed;
  const final=promoted?await store.transition(created.experimentId,'promoted'):await store.transition(created.experimentId,'retired');
  return {experimentId:created.experimentId,replayManifestId:input.replayManifestId,backtest,walkForward,finalStage:final.stage as 'paper'|'promoted'|'retired'};
}

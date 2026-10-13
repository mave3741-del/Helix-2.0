import { createHash } from 'node:crypto';
import type { Bar } from '../../runtime/tools/trading.ts';
import { runWalkForward, type FittedStrategy } from './walk-forward.ts';

export interface RlOosWindow { index:number; trainStart:number; trainEnd:number; embargoBars:number; testStart:number; testEnd:number; }
export interface RlOosEvaluationInput {
  bars: Bar[];
  trainBars: number;
  testBars: number;
  stepBars?: number;
  embargoBars?: number;
  feeBps?: number;
  slippageBps?: number;
  fit: (train: Bar[], fold: number) => FittedStrategy;
  environmentHash: string;
  algorithm: string;
  seed: number;
}
export interface RlOosEvaluationResult {
  windows: RlOosWindow[];
  aggregate: { windows:number; profitableWindows:number; medianReturn:number; worstDrawdown:number; meanSharpe:number; robustness:number };
  deterministicHash: string;
}

const stable=(v:unknown):string=>v===null||typeof v!=='object'?JSON.stringify(v):Array.isArray(v)?`[${v.map(stable).join(',')}]`:`{${Object.keys(v as Record<string,unknown>).sort().map(k=>`${JSON.stringify(k)}:${stable((v as Record<string,unknown>)[k])}`).join(',')}}`;
const hash=(v:unknown)=>createHash('sha256').update(stable(v),'utf8').digest('hex');

/** Strict RL OOS evaluation: fitter sees only training bars; embargo bars are excluded from both fit and test. */
export function evaluateRlOos(input:RlOosEvaluationInput):RlOosEvaluationResult {
  if (!input.environmentHash.trim()) throw new Error('rl_oos_environment_hash_required');
  if (!input.algorithm.trim()) throw new Error('rl_oos_algorithm_required');
  if (!Number.isInteger(input.seed)) throw new Error('rl_oos_seed_invalid');
  const bars=[...input.bars].sort((a,b)=>a.ts-b.ts);
  const train=Math.max(2,Math.floor(input.trainBars));
  const test=Math.max(1,Math.floor(input.testBars));
  const embargo=Math.max(0,Math.floor(input.embargoBars??0));
  if (bars.length < train+embargo+test) throw new Error('rl_oos_insufficient_bars');
  const result=runWalkForward({bars,trainBars:train,testBars:test,stepBars:input.stepBars??test,embargoBars:embargo,feeBps:input.feeBps,slippageBps:input.slippageBps,fit:(trainBars,fold)=>input.fit(trainBars,fold)});
  const windows=result.folds.map(f=>({index:f.index,trainStart:f.trainStart,trainEnd:f.trainEnd,embargoBars:embargo,testStart:f.testStart,testEnd:f.testEnd}));
  if (windows.some(w=>w.trainEnd>=w.testStart || w.testEnd<w.testStart)) throw new Error('rl_oos_window_invalid');
  const returns=result.folds.map(f=>f.metrics.netReturn);
  const median=[...returns].sort((a,b)=>a-b); const med=median.length%2?median[Math.floor(median.length/2)]:((median[median.length/2-1]??0)+(median[median.length/2]??0))/2;
  const profitable=returns.filter(x=>x>0).length;
  const aggregate={windows:result.aggregate.folds,profitableWindows:profitable,medianReturn:med,worstDrawdown:result.aggregate.worstDrawdown,meanSharpe:result.aggregate.meanSharpe,robustness:result.aggregate.robustness};
  return {windows,aggregate,deterministicHash:hash({environmentHash:input.environmentHash,algorithm:input.algorithm,seed:input.seed,windows,aggregate,config:{train,test,embargo,stepBars:input.stepBars??test,feeBps:input.feeBps??5,slippageBps:input.slippageBps??2}})};
}

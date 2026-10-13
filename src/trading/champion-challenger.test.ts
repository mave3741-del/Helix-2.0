import assert from 'node:assert/strict';
import test from 'node:test';
import { decideChampionChallenger } from './champion-challenger.ts';

const base = { tradeCount:60, meanReturn:0.02, volatility:0.05, sharpe:3, tStatistic:2.5, significantAt95:true, maxDrawdown:0.1, robustness:0.8, multipleTestingPenalty:0.9, adjustedScore:1.8 };
const metrics = (strategyId: string, score: number) => ({ strategyId, evaluationAt: Date.now(), maxAgeMs:3600000, statistical:{...base, adjustedScore:score}, parameterSensitivityPassed:true, bootstrapPassed:true, oosPassed:true, walkForwardPassed:true, paperTradeCount:60, currentDrawdown:0.1 });
const snap = (id:string,pnl:number,cover=1) => ({ snapshotId:id, strategyId:id, asOfTs:Date.now(), tradeCount:60, wins:40, losses:20, netPnl:pnl, grossPnl:pnl+1, fees:0.2, slippageCost:0.1, winRate:2/3, avgTradePnl:pnl/60, maxDrawdown:0.1, profitFactor:2, expectancy:pnl/60, byRegime:{trend:{trades: cover>=1?20:2,netPnl:pnl*0.5,winRate:0.6},range:{trades: cover>=1?20:2,netPnl:pnl*0.3,winRate:0.55},volatile:{trades:20,netPnl:pnl*0.2,winRate:0.52}}, attributionHash:id });

test('promotes robust challenger with meaningful advantage',()=>{
  const d=decideChampionChallenger({champion:metrics('c',1.8),challenger:metrics('x',2.1),championEligible:{eligible:true,reasons:[],score:1.8},challengerEligible:{eligible:true,reasons:[],score:2.1},minScoreAdvantage:0.1,minPnlAdvantage:1,regimeCoverageMin:0.6,championSnapshot:snap('c',20),challengerSnapshot:snap('x',24)});
  assert.equal(d.promote,true);
});

test('rejects challenger without enough evidence advantage',()=>{
  const d=decideChampionChallenger({champion:metrics('c',1.8),challenger:metrics('x',1.85),championEligible:{eligible:true,reasons:[],score:1.8},challengerEligible:{eligible:true,reasons:[],score:1.85},minScoreAdvantage:0.1,minPnlAdvantage:1,regimeCoverageMin:0.6,championSnapshot:snap('c',20),challengerSnapshot:snap('x',20)});
  assert.equal(d.promote,false);
  assert.ok(d.reasons.includes('insufficient_score_advantage'));
});

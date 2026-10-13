import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateRlRobustness } from './rl-robustness-gate.ts';

const bars = Array.from({length: 24}, (_, i) => ({ts:i, open:100, high:111, low:89, close:i%2?90:110, volume:10}));
const input = { bars, seeds:[7,11], trainBars:6, testBars:3, stepBars:3, environmentHash:'env', algorithm:'ppo', fit:()=>()=> 'long' as const,
  stressEvaluate: (_seed:number, x:any) => ({netReturn:x.scenario==='volatility-spike'?-0.2:-0.05, maxDrawdown:0.2, sharpe:0.5}) };
const gate = {oos:{minSeedAgreement:0,minProfitableWindowRate:0,maxWorstDrawdown:1,minMedianReturn:-1,minMeanSharpe:-100}, stress:{minScenarioPassRate:0.6,minNetReturn:-0.25,maxDrawdown:1,minSharpe:-10,allowDegradedDataPass:false}, minCombinedStressPassRate:0.6, minSeedRobustnessRate:0.5};

test('combines multi-seed OOS and stress results into one promotion gate',()=>{const r=evaluateRlRobustness(input,gate); assert.equal(r.aggregate.seeds,2); assert.equal(r.aggregate.stressCases,10); assert.equal(r.aggregate.passedStressCases,8); assert.equal(r.aggregate.combinedStressPassRate,0.8); assert.equal(r.gate.eligible,true);});
test('one seed failing stress can fail the seed robustness gate',()=>{const r=evaluateRlRobustness({...input,stressEvaluate:(seed:number,x:any)=>({netReturn:seed===11&&x.scenario==='regime-shift'?-1:-0.05,maxDrawdown:seed===11&&x.scenario==='regime-shift'?2:0.2,sharpe:seed===11&&x.scenario==='regime-shift'?-20:0.5})},{...gate,minSeedRobustnessRate:1}); assert.equal(r.aggregate.robustSeeds,1); assert.equal(r.gate.eligible,false); assert.ok(r.gate.reasons.includes('seed_robustness_rate_below_gate'));});
test('deterministic combined evidence is stable',()=>{const a=evaluateRlRobustness(input,gate); const b=evaluateRlRobustness(input,gate); assert.equal(a.deterministicHash,b.deterministicHash);});
test('failed OOS cannot be hidden by passing stress cases',()=>{const r=evaluateRlRobustness(input,{...gate,oos:{...gate.oos,maxWorstDrawdown:0}}); assert.equal(r.gate.eligible,false); assert.ok(r.gate.reasons.includes('oos_gate_failed'));});

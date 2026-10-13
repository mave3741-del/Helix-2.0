import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateRlStress } from './rl-stress-evaluation.ts';

const bars=Array.from({length:20},(_,i)=>({ts:i,open:100+i,high:102+i,low:98+i,close:100+i,volume:10}));
const gate={minScenarioPassRate:0.8,minNetReturn:-0.15,maxDrawdown:1,minSharpe:-10,allowDegradedDataPass:false};
const evaluate=({scenario,feeBps,slippageBps}:any)=>({netReturn:scenario==='volatility-spike'?-0.2:-0.1-feeBps/1000-slippageBps/1000,maxDrawdown:0.2,sharpe:0.5});

test('stress evaluation covers all required adversarial scenarios',()=>{const r=evaluateRlStress({bars,environmentHash:'env',algorithm:'ppo',seed:7,evaluate},gate); assert.equal(r.aggregate.scenarioCount,5); assert.equal(r.aggregate.passRate,0.6); assert.equal(r.gate.eligible,false);});
test('degraded data fails closed before evaluator is invoked',()=>{let called=0; const r=evaluateRlStress({bars,environmentHash:'env',algorithm:'ppo',seed:7,evaluate:()=>{called++;return {netReturn:1,maxDrawdown:0,sharpe:1}}},{...gate,minScenarioPassRate:0}); const x=r.scenarios.find(s=>s.scenario==='degraded-data')!; assert.equal(called,4); assert.equal(x.passed,false); assert.ok(x.reasons.includes('degraded_data_fail_closed'));});
test('transaction cost shock changes evaluation costs',()=>{const r=evaluateRlStress({bars,environmentHash:'env',algorithm:'ppo',seed:7,evaluate:({feeBps,slippageBps}:any)=>({netReturn:-(feeBps+slippageBps),maxDrawdown:0,sharpe:0})},{...gate,minScenarioPassRate:0,minNetReturn:-100}); const x=r.scenarios.find(s=>s.scenario==='transaction-cost-shock')!; assert.equal(x.feeBps,20); assert.equal(x.slippageBps,8);});
test('stress result is deterministic',()=>{const input={bars,environmentHash:'env',algorithm:'ppo',seed:7,evaluate}; const a=evaluateRlStress(input,{...gate,minScenarioPassRate:0}); const b=evaluateRlStress(input,{...gate,minScenarioPassRate:0}); assert.equal(a.deterministicHash,b.deterministicHash);});
test('invalid metrics reject a scenario',()=>{const r=evaluateRlStress({bars,environmentHash:'env',algorithm:'ppo',seed:7,evaluate:()=>({netReturn:NaN,maxDrawdown:0,sharpe:1})},{...gate,minScenarioPassRate:0}); assert.equal(r.scenarios[0]!.passed,false); assert.ok(r.scenarios[0]!.reasons.includes('non_finite_metrics'));});

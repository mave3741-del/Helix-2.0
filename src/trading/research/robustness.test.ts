import test from 'node:test';
import assert from 'node:assert/strict';
import { deterministicBootstrapReturns, evaluateParameterSensitivity } from './robustness.ts';

test('parameter sensitivity is deterministic and can reject unstable strategies',()=>{
  const r=evaluateParameterSensitivity({baseParams:{lookback:20,threshold:1},steps:4,evaluate:p=>p.lookback===20&&p.threshold===1?1:0.2});
  assert.equal(r.passed,false); assert.equal(r.perturbations,8);
});

test('seeded bootstrap is replayable and requires positive lower confidence bound',()=>{
  const returns=Array.from({length:60},(_,i)=>0.01+(i%3)*0.001);
  const a=deterministicBootstrapReturns(returns,{samples:300,seed:42}); const b=deterministicBootstrapReturns(returns,{samples:300,seed:42});
  assert.deepEqual(a,b); assert.equal(a.passed,true);
});

test('bootstrap rejects insufficient samples',()=>{
  assert.equal(deterministicBootstrapReturns(Array(29).fill(0.01)).passed,false);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateRlMultiSeedOos } from './rl-multiseed-walk-forward.ts';

const bars = Array.from({length: 24}, (_, i) => { const close = i % 2 ? 90 : 110; return {ts:i, open:100, high:111, low:89, close, volume:1}; });
const base = { bars, seeds:[7,11,19], trainBars:6, testBars:3, stepBars:3, environmentHash:'env', algorithm:'ppo', fit:()=>()=> 'long' as const };
const permissive = {minSeedAgreement:2/3,minProfitableWindowRate:0,maxWorstDrawdown:1,minMedianReturn:-1,minMeanSharpe:-100};

test('multi-seed OOS requires distinct seeds and combines identical fold geometry',()=>{
 const r=evaluateRlMultiSeedOos(base, permissive);
 assert.equal(r.aggregate.seeds,3);
 assert.equal(r.aggregate.windowsPerSeed,6);
 assert.equal(r.aggregate.totalWindows,18);
 assert.equal(r.gate.eligible,true);
});

test('multi-seed OOS is deterministic',()=>{
 const a=evaluateRlMultiSeedOos(base, permissive);
 const b=evaluateRlMultiSeedOos(base, permissive);
 assert.equal(a.deterministicHash,b.deterministicHash);
});

test('worst-case risk gate can reject promotion',()=>{
 const r=evaluateRlMultiSeedOos(base,{...permissive,maxWorstDrawdown:0});
 assert.equal(r.gate.eligible,false);
 assert.ok(r.gate.reasons.includes('worst_drawdown_above_gate'));
});

test('single seed is rejected',()=>{
 assert.throws(()=>evaluateRlMultiSeedOos({...base,seeds:[7]},permissive),/requires_two_distinct_integer_seeds/);
});

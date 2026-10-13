import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateRlOos } from './rl-oos-evaluation.ts';

const bars=Array.from({length:18},(_,i)=>({ts:i,open:100+i,high:101+i,low:99+i,close:100+i,volume:1}));

test('RL OOS evaluation keeps fit data before OOS test data',()=>{
 const seen:number[]=[];
 const r=evaluateRlOos({bars,trainBars:6,testBars:3,stepBars:3,fit:(train)=>{seen.push(train.at(-1)!.ts);return()=> 'long';},environmentHash:'env',algorithm:'algo',seed:7});
 assert.equal(r.windows.length,4);
 assert.ok(r.windows.every(w=>w.trainEnd<w.testStart));
 assert.deepEqual(seen,[5,8,11,14]);
 assert.equal(r.aggregate.windows,4);
});

test('RL OOS result hash is deterministic',()=>{
 const input={bars,trainBars:6,testBars:3,stepBars:3,fit:()=>()=> 'flat' as const,environmentHash:'env',algorithm:'algo',seed:7};
 assert.equal(evaluateRlOos(input).deterministicHash,evaluateRlOos(input).deterministicHash);
});

test('non-zero embargo is structurally excluded from OOS windows',()=>{
 const r=evaluateRlOos({bars,trainBars:6,testBars:3,embargoBars:1,fit:()=>()=> 'flat' as const,environmentHash:'env',algorithm:'algo',seed:7});
 assert.equal(r.windows[0].testStart,7);
 assert.equal(r.windows[0].trainEnd,5);
 assert.equal(r.windows[0].embargoBars,1);
});

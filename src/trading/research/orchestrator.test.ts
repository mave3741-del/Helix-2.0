import test from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryResearchExperimentStore } from './experiment.ts';
import { runResearchToPaperPipeline } from './orchestrator.ts';

const bars = Array.from({length:30},(_,i)=>({ts:i+1,open:100+i,high:102+i,low:99+i,close:101+i,volume:10}));

test('research orchestration uses an immutable train/OOS boundary and history-only signals', async () => {
  const store = new InMemoryResearchExperimentStore();
  const result = await runResearchToPaperPipeline(store,{ experiment:{experimentId:'exp-orch',strategyId:'s-orch',parentExperimentId:null,stage:'research',spec:{family:'trend'}}, bars,
    fitStrategy:(train,stage)=>{ const fittedTrainLength=train.length; if(stage==='out_of_sample') assert.equal(fittedTrainLength,21); return (history)=>{ if(stage==='out_of_sample') assert.ok(history.length>=fittedTrainLength); assert.ok(history.length<=bars.length); return history.at(-1)!.close>=history.at(-2)!.close?'long':'flat'; }; },
    replayManifestId:'replay-1', trainBars:10, testBars:5, paperEvaluation:{return:.1,robustness:.8,maxDrawdown:.1}, paperReturns:Array.from({length:60},(_,i)=>0.008 + (i%3)*0.002), candidateCount:1 });
  assert.equal(result.replayManifestId,'replay-1');
  assert.equal(result.finalStage,'promoted');
  assert.equal((await store.get('exp-orch'))?.stage,'promoted');
  assert.equal((await store.listEvaluations('exp-orch')).length,4);
});

test('walk-forward fitter cannot receive future test bars', async () => {
  const store = new InMemoryResearchExperimentStore();
  let violation=false;
  await runResearchToPaperPipeline(store,{ experiment:{experimentId:'exp-wf',strategyId:'s-wf',parentExperimentId:null,stage:'research',spec:{}}, bars,
    fitStrategy:(train,stage)=>{ if(stage==='walk_forward'){ const trainEnd=train.at(-1)!.ts; return history=>{ if(history.some(b=>b.ts>trainEnd && b.ts>history.at(-1)!.ts)) violation=true; return 'flat'; }; } return ()=> 'flat'; },
    replayManifestId:'r',trainBars:8,testBars:4,paperEvaluation:{robustness:0,maxDrawdown:1} });
  assert.equal(violation,false);
});

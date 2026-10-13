import test from "node:test";
import assert from "node:assert/strict";
import { InMemoryResearchExperimentStore } from "./experiment.ts";

test("research experiment lifecycle enforces ordered promotion gates", async () => {
  const store = new InMemoryResearchExperimentStore();
  await store.create({experimentId:"exp-1",strategyId:"s1",parentExperimentId:null,stage:"research",spec:{family:"trend"}});
  await assert.rejects(() => store.transition("exp-1","paper"), /invalid_research_transition/);
  for (const stage of ["backtest","out_of_sample","walk_forward","paper","promoted"] as const) await store.transition("exp-1", stage);
  const current = await store.get("exp-1");
  assert.equal(current?.stage,"promoted");
  assert.ok(current?.finalizedAt);
});

test("research evaluations are immutable and hash their metrics", async () => {
  const store = new InMemoryResearchExperimentStore();
  await store.create({experimentId:"exp-2",strategyId:"s2",parentExperimentId:null,stage:"backtest",spec:{x:1}});
  const evaluation = await store.addEvaluation({evaluationId:"ev-1",experimentId:"exp-2",phase:"in_sample",windowStart:1,windowEnd:2,metrics:{netReturn:0.1,sharpe:1.2},passed:true});
  assert.equal(evaluation.experimentId,"exp-2");
  assert.ok(evaluation.resultHash);
  await assert.rejects(() => store.addEvaluation({evaluationId:"ev-1",experimentId:"exp-2",phase:"in_sample",windowStart:1,windowEnd:2,metrics:{netReturn:0.2},passed:false}), /evaluation_exists/);
});

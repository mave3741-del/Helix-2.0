import test from "node:test";
import assert from "node:assert/strict";
import { InMemoryWorkerReasoningTraceStore } from "./reasoning-store.ts";

test("worker reasoning traces are idempotent and queryable by task", async () => {
  const store = new InMemoryWorkerReasoningTraceStore();
  const record = {reasonId:"reason:1",taskId:"task-1",workerId:"worker-0001",taskType:"evidence.review",provider:"test",modelId:"fake",policyVersion:"v1",inputHash:"in",outputHash:"out",trace:{evidenceIds:["e1"]},createdAt:1};
  assert.equal((await store.record(record)).inserted,true);
  assert.equal((await store.record(record)).inserted,false);
  assert.equal((await store.listByTask("task-1")).length,1);
});

import test from "node:test";
import assert from "node:assert/strict";
import { ModelBackedWorkerReasoningProvider, type ModelClient } from "./model-reasoning.ts";
import type { TradingWorkerIdentity } from "../runtime/worker-registry.ts";
import type { TradingEvidencePacket } from "../evidence.ts";

const worker = { workerId:"worker-0001", workerNumber:1, family:"Macro", specializationName:"Macro Rates", capabilities:["market-data"], markets:["all"], status:"available", workload:0 } as TradingWorkerIdentity;
const packet = { evidenceId:"e1", subjectId:"BTCUSDT", evidenceType:"macro", claim:"Rates eased", confidence:0.9, source:"test", eventTs:1, publishedTs:1, retrievedTs:1, payload:{value:1}, provenance:{source:"test"}, contentHash:"h" } as TradingEvidencePacket;

function client(text:string): ModelClient { return { async complete(){ return {text,modelId:"mock-1",provider:"mock"}; } }; }

test("model-backed reasoning parses structured output and preserves evidence citations", async () => {
  const provider = new ModelBackedWorkerReasoningProvider({client:client(JSON.stringify({summary:"supportive",assumptions:["a"],evidenceIds:["e1"],stance:"bull",confidence:0.82,critique:"challenge needed"}))});
  const result = await provider.reviewEvidence({worker,packet});
  assert.equal(result.modelId,"mock-1");
  assert.deepEqual(result.evidenceIds,["e1"]);
  assert.equal(result.stance,"bull");
});

test("model-backed reasoning rejects citations outside the supplied evidence set", async () => {
  const provider = new ModelBackedWorkerReasoningProvider({client:client(JSON.stringify({summary:"bad",assumptions:[],evidenceIds:["not-supplied"],stance:"neutral",confidence:0.5,critique:""}))});
  await assert.rejects(() => provider.reviewEvidence({worker,packet}), /model_reasoning_unknown_evidence_id/);
});

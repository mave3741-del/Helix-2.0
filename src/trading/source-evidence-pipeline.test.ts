import test from "node:test";
import assert from "node:assert/strict";
import { NormalizedSourceEvidencePipeline } from "./source-evidence-pipeline.ts";
import { InMemoryEvidenceStore, InMemoryEvidenceFanoutStore, EvidenceFanoutService } from "./evidence.ts";
import { InMemoryTaskQueue } from "./runtime/task-queue.ts";
import { InMemoryTradingWorkerRegistry } from "./runtime/worker-registry.ts";

test("normalized source observations become durable quality-scored evidence and fan out", async () => {
  const evidence = new InMemoryEvidenceStore();
  const registry = new InMemoryTradingWorkerRegistry();
  await registry.ensureSeeded(1000);
  const queue = new InMemoryTaskQueue();
  const fanout = new InMemoryEvidenceFanoutStore();
  const service = new EvidenceFanoutService(evidence, queue, registry, fanout);
  const pipeline = new NormalizedSourceEvidencePipeline({ evidence, fanout: service });

  const result = await pipeline.ingestBatch({
    source: "fred.series.observations",
    asOfTs: 10_000,
    observations: [{
      subjectId: "DGS10",
      eventTs: 9_000,
      publishedTs: 9_500,
      availableTs: 9_500,
      value: 4.1,
      provenance: { source: "fred", url: "https://api.stlouisfed.org", retrievedTs: 9_600 },
    }],
    rejected: [],
  }, {
    evidenceType: "macro.observation",
    claim: (observation) => `DGS10=${observation.value}`,
    sourceTier: 1,
    requiredProvenance: ["source", "url", "retrievedTs"],
    fanout: { maxRecipients: 3, routing: { family: "Macro" } },
  });

  assert.equal(result.inserted, 1);
  assert.equal(result.accepted.length, 1);
  assert.equal(result.workerIds.length, 3);
  const stored = await evidence.get(result.accepted[0].evidenceId);
  assert.ok(Math.abs((stored?.quality?.score ?? 0) - 1) < 0.00001);
  // `provenance` is intentionally typed as the loose `Record<string, unknown>`
  // (it's a free-form bag written by many different source adapters); the
  // `pointInTime` shape below is what source-evidence-pipeline.ts actually
  // writes into it.
  const pointInTime = stored?.provenance.pointInTime as { asOfTs: number } | undefined;
  assert.equal(pointInTime?.asOfTs, 10_000);
  assert.equal((await fanout.list(result.accepted[0].evidenceId)).length, 3);
});

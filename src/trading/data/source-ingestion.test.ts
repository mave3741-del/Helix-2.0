import test from "node:test";
import assert from "node:assert/strict";
import { HttpJsonSourceAdapter, SourceEvidenceIngestor } from "./source-ingestion.ts";
import { InMemoryEvidenceStore } from "../evidence.ts";

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

test("http json source adapter enforces host allowlist and returns structured source data", async () => {
  let called = 0;
  const source = new HttpJsonSourceAdapter({
    id: "test-source",
    allowedHosts: ["example.test"],
    fetchImpl: async () => { called += 1; return response({ value: 7 }); },
  });
  const result = await source.fetch({ url: "https://example.test/feed" });
  assert.equal(result.status, 200);
  assert.deepEqual(result.data, { value: 7 });
  assert.equal(called, 1);
  await assert.rejects(() => source.fetch({ url: "https://other.test/feed" }), /source_host_not_allowlisted/);
  await assert.rejects(() => source.fetch({ url: "http://127.0.0.1/feed" }), /source_private_host_not_allowed/);
});

test("source evidence ingestor persists provenance and remains idempotent", async () => {
  const evidence = new InMemoryEvidenceStore();
  const source = new HttpJsonSourceAdapter({ id: "official-test", allowedHosts: ["example.test"], fetchImpl: async () => response({ x: 1 }) });
  const ingestor = new SourceEvidenceIngestor(evidence, source);
  const first = await ingestor.ingestJson({ url: "https://example.test/feed" }, {
    evidenceId: "official-e-1", subjectId: "AAPL", evidenceType: "filing", claim: "revenue update", confidence: 0.9, eventTs: 1000,
  });
  const second = await ingestor.ingestJson({ url: "https://example.test/feed" }, {
    evidenceId: "official-e-1", subjectId: "AAPL", evidenceType: "filing", claim: "revenue update", confidence: 0.9, eventTs: 1000,
  });
  assert.equal(first.inserted, true);
  assert.equal(second.inserted, false);
  assert.equal((await evidence.get("official-e-1"))?.provenance.adapterId, "official-test");
});

test("source pipeline ingests, persists, and fans out to worker tasks", async () => {
  const evidence = new InMemoryEvidenceStore();
  const registry = new (await import("../runtime/worker-registry.ts")).InMemoryTradingWorkerRegistry();
  await registry.ensureSeeded(1);
  const queue = new (await import("../runtime/task-queue.ts")).InMemoryTaskQueue();
  const fanout = new (await import("../evidence.ts")).InMemoryEvidenceFanoutStore();
  const { EvidenceFanoutService: FanoutService } = await import("../evidence.ts");
  const source = new HttpJsonSourceAdapter({ id: "macro-test", allowedHosts: ["example.test"], fetchImpl: async () => response({ surprise: 0.4 }) });
  const pipeline = new (await import("./source-ingestion.ts")).SourceEvidencePipeline({
    evidence,
    source,
    fanout: new FanoutService(evidence, queue, registry, fanout),
  });
  const result = await pipeline.ingestAndFanout({ url: "https://example.test/macro" }, {
    evidenceId: "macro-e-1", subjectId: "SPX", evidenceType: "macro", claim: "macro surprise", confidence: 0.8, eventTs: 1000,
  }, { routing: { family: "Macro" }, maxRecipients: 3, priority: 30 });
  assert.equal(result.inserted, true);
  assert.equal(result.workerIds.length, 3);
  assert.equal(result.tasks.length, 3);
  assert.equal((await evidence.get("macro-e-1"))?.provenance.sourceUrl, "https://example.test/macro");
});

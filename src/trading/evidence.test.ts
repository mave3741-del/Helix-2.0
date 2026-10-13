import test from "node:test";
import assert from "node:assert/strict";
import { buildEvidencePacket, EvidenceFanoutService, InMemoryEvidenceFanoutStore, InMemoryEvidenceStore } from "./evidence.ts";
import { InMemoryTaskQueue } from "./runtime/task-queue.ts";
import { InMemoryTradingWorkerRegistry } from "./runtime/worker-registry.ts";

test("evidence packets are immutable and idempotent", async () => {
  const store = new InMemoryEvidenceStore();
  const packet = await buildEvidencePacket({ evidenceId: "e-1", subjectId: "BTC", evidenceType: "news", claim: "macro event", confidence: 0.8, source: "official", eventTs: 1000, retrievedTs: 1100, payload: { x: 1 } });
  assert.equal((await store.append(packet)).inserted, true);
  assert.equal((await store.append(packet)).inserted, false);
  assert.equal((await store.get("e-1"))?.contentHash, packet.contentHash);
});

test("evidence fans out deterministically to relevant specialist workers", async () => {
  const registry = new InMemoryTradingWorkerRegistry();
  await registry.ensureSeeded(1000);
  const queue = new InMemoryTaskQueue();
  const fanout = new InMemoryEvidenceFanoutStore();
  const service = new EvidenceFanoutService(new InMemoryEvidenceStore(), queue, registry, fanout);
  const packet = await buildEvidencePacket({ evidenceId: "e-news", subjectId: "BTC", evidenceType: "news", claim: "event", confidence: 0.9, source: "wire", eventTs: 1000, retrievedTs: 1100, payload: { symbol: "BTC" } });
  const result = await service.publish(packet, { routing: { family: "News", requiredCapability: "news" }, maxRecipients: 4, priority: 70 });
  assert.equal(result.workerIds.length, 4);
  assert.equal(new Set(result.workerIds).size, 4);
  assert.equal((await queue.peek(10, 1100)).length, 4);
  assert.equal((await fanout.list("e-news")).length, 4);
});

test("fanout is idempotent for the same evidence and worker", async () => {
  const registry = new InMemoryTradingWorkerRegistry();
  await registry.ensureSeeded(1000);
  const queue = new InMemoryTaskQueue();
  const evidence = new InMemoryEvidenceStore();
  const fanout = new InMemoryEvidenceFanoutStore();
  const service = new EvidenceFanoutService(evidence, queue, registry, fanout);
  const packet = await buildEvidencePacket({ evidenceId: "e-dup", subjectId: "AAPL", evidenceType: "filing", claim: "guidance", confidence: 0.7, source: "sec", eventTs: 1000, retrievedTs: 1001, payload: { filing: "10-Q" } });
  await service.publish(packet, { routing: { family: "Fundamental" }, maxRecipients: 3 });
  await service.publish(packet, { routing: { family: "Fundamental" }, maxRecipients: 3 });
  assert.equal((await queue.peek(20, 1001)).length, 3);
  assert.equal((await fanout.list("e-dup")).length, 3);
});

test("evidence queries can require a minimum durable quality score", async () => {
  const store = new InMemoryEvidenceStore();
  const high = await buildEvidencePacket({ evidenceId: "e-quality-high", subjectId: "SPX", evidenceType: "macro", claim: "high", confidence: 0.8, source: "official", eventTs: 1000, retrievedTs: 1001, payload: {}, quality: { score: 0.92, dimensions: { sourceTier: 1, pointInTime: 1, provenance: 1, freshness: 0.8, completeness: 1 }, reasons: [] } });
  const low = await buildEvidencePacket({ evidenceId: "e-quality-low", subjectId: "SPX", evidenceType: "macro", claim: "low", confidence: 0.8, source: "unknown", eventTs: 1001, retrievedTs: 1002, payload: {}, quality: { score: 0.35, dimensions: { sourceTier: 0.4, pointInTime: 1, provenance: 0.5, freshness: 0.1, completeness: 1 }, reasons: ["source_tier_below_preferred"] } });
  await store.append(high);
  await store.append(low);
  const results = await store.list({ subjectId: "SPX", minQuality: 0.9 });
  assert.deepEqual(results.map((x) => x.evidenceId), ["e-quality-high"]);
});

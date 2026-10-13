import assert from "node:assert/strict";
import test from "node:test";
import { DeterministicMarketScanner, filterCandidatesByPortfolio, type MarketSnapshot } from "./market-scanner.ts";
import { InMemoryTaskQueue } from "./runtime/task-queue.ts";

function market(symbol: string, score: number, ts = 1_000_000): MarketSnapshot {
  return { symbol, venue: "test", market: "equity", last: 100, bid: 99.99, ask: 100.01, liquidityScore: score, unusualVolume: score, return1h: score / 10, return24h: score / 10, volatility: score / 10, relativeStrength: score, timestamp: ts };
}

test("scans at most 1000 markets and ranks deterministic candidates", () => {
  const scanner = new DeterministicMarketScanner({ candidateLimit: 3 });
  const markets = Array.from({ length: 1_050 }, (_, i) => market(`M${String(i).padStart(4, "0")}`, (i % 10) / 10));
  const result = scanner.scan(markets, 1_000_010);
  assert.equal(result.universeSize, 1_000);
  assert.equal(result.candidates.length, 3);
  assert.deepEqual(result.candidates.map((x) => x.symbol), ["M0009", "M0019", "M0029"]);
});

test("rejects stale, invalid, and illiquid markets before ranking", () => {
  const scanner = new DeterministicMarketScanner({ staleAfterMs: 90_000, minLiquidityScore: 0.35 });
  const result = scanner.scan([
    market("GOOD", 0.8, 1_000_000),
    market("STALE", 0.9, 800_000),
    { ...market("BAD", 0.9), ask: 99 },
    market("THIN", 0.1),
  ], 1_000_010);
  assert.equal(result.validMarkets, 1);
  assert.equal(result.rejectedMarkets, 3);
  assert.equal(result.candidates[0]?.symbol, "GOOD");
});

test("candidate tasks are idempotent and routed to market-analysis workers", async () => {
  const queue = new InMemoryTaskQueue();
  const scanner = new DeterministicMarketScanner({ candidateLimit: 2 });
  const result = scanner.scan([market("AAA", 0.9), market("BBB", 0.8)], 1_000_010);
  assert.equal(await scanner.enqueueCandidates(result, queue), 2);
  assert.equal(await scanner.enqueueCandidates(result, queue), 0);
  const tasks = await queue.peek(10);
  assert.equal(tasks.length, 2);
  assert.equal((tasks[0].payload as any)._routing.requiredCapability, "market-analysis");
});

test("high-volatility mode selects five-minute cadence without changing scan semantics", () => {
  const scanner = new DeterministicMarketScanner();
  scanner.setHighVolatility(true);
  const result = scanner.scan([market("AAA", 0.9)], 1_000_010);
  assert.equal(result.cadence, "high-volatility");
});

test("records deterministic rejection reasons and score/policy versions", () => {
  const scanner = new DeterministicMarketScanner({ maxSpreadBps: 10 });
  const result = scanner.scan([
    market("GOOD", 0.8),
    { ...market("STALE", 0.8, 800_000) },
    { ...market("WIDE", 0.8), ask: 101 },
    { ...market("THIN", 0.1) },
  ], 1_000_010);
  assert.equal(result.rejectionReasons?.stale, 1);
  assert.equal(result.rejectionReasons?.excessive_spread, 1);
  assert.equal(result.rejectionReasons?.illiquid, 1);
  assert.equal(result.scoreVersion, "market-score-v2");
  assert.equal(result.policyVersion, "market-scan-policy-v2");
});

test("deduplicates candidate work during the configured cooldown", () => {
  const scanner = new DeterministicMarketScanner({ candidateLimit: 2, candidateCooldownMs: 600_000 });
  const first = scanner.scan([market("AAA", 0.9)], 1_000_010);
  const second = scanner.scan([market("AAA", 0.9)], 1_100_000);
  assert.equal(first.candidates.length, 1);
  assert.equal(second.candidates.length, 0);
});

test("future-dated market data is rejected", () => {
  const scanner = new DeterministicMarketScanner();
  const result = scanner.scan([market("FUTURE", 0.9, 1_000_011)], 1_000_010);
  assert.equal(result.validMarkets, 0);
  assert.equal(result.rejectionReasons?.stale, 1);
});

test("authoritative source retries and records provenance", async () => {
  const scanner = new DeterministicMarketScanner({ sourceTimeoutMs: 1_000, sourceMaxAttempts: 3 });
  let calls = 0;
  const result = await scanner.scanFromUniverse(
    { async getUniverse(asOfTs) { return { universeId: "u", version: "v", asOfTs, entries: [{ symbol: "AAA", venue: "test", market: "equity", active: true, source: "test", effectiveFrom: 1 }] }; } },
    async (symbols) => { calls += 1; if (calls < 2) throw new Error("temporary"); return symbols.map((symbol) => market(symbol, 0.9, 1_000_010)); },
    1_000_010,
  );
  assert.equal(calls, 2);
  assert.equal(result.provenance?.sourceAttempts, 2);
  assert.deepEqual(result.provenance?.sourceSymbols, ["AAA"]);
});

test("portfolio filter removes concentrated symbols", () => {
  const candidates = [
    { ...market("AAA", 0.9), score: 0.9, reasons: ["momentum"], snapshotTs: 1 },
    { ...market("BBB", 0.8), score: 0.8, reasons: ["volume"], snapshotTs: 1 },
  ].map(({ symbol, venue, market: kind, score, reasons, timestamp }) => ({ symbol, venue, market: kind, score, reasons, snapshotTs: timestamp }));
  const filtered = filterCandidatesByPortfolio(candidates, { equity: 100_000, exposures: [{ symbol: "AAA", notional: 30_000, side: "long" }] });
  assert.deepEqual(filtered.map((x) => x.symbol), ["BBB"]);
});

import { InMemoryMarketScanProvenanceStore } from "./market-scan-provenance.ts";

test("persists scan provenance idempotently", async () => {
  const scanner = new DeterministicMarketScanner();
  const result = scanner.scan([market("AAA", 0.9)], 1_000_010);
  const store = new InMemoryMarketScanProvenanceStore();
  await store.append({ ...result, recordedAt: 1_000_020 });
  await store.append({ ...result, recordedAt: 1_000_030 });
  const saved = await store.get(result.scanId);
  assert.equal(saved?.recordedAt, 1_000_020);
  assert.equal((await store.list()).length, 1);
});

test("scanner exposes health status and cadence", () => {
  const scanner = new DeterministicMarketScanner({ normalIntervalMs: 600_000, highVolatilityIntervalMs: 300_000 });
  assert.equal(scanner.getStatus().running, false);
  scanner.setHighVolatility(true);
  scanner.start(async () => [market("AAA", 0.9)]);
  assert.equal(scanner.getStatus().running, true);
  assert.equal(scanner.getStatus().cadenceMs, 300_000);
  scanner.stop();
});

test("scanner persists provenance when a store is configured", async () => {
  const store = new InMemoryMarketScanProvenanceStore();
  const scanner = new DeterministicMarketScanner({ provenanceStore: store });
  const result = scanner.scan([market("AAA", 0.9)], 1_000_010);
  await new Promise(r => setTimeout(r, 0));
  assert.equal((await store.get(result.scanId))?.scoreVersion, "market-score-v2");
});

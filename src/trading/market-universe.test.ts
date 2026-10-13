import assert from "node:assert/strict";
import test from "node:test";
import { normalizeMarketUniverse, type MarketUniverseProvider } from "./market-universe.ts";
import { DeterministicMarketScanner } from "./market-scanner.ts";

test("normalizes authoritative universe deterministically and caps at 1000", () => {
  const entries = Array.from({ length: 1005 }, (_, i) => ({ symbol: `m${i}`, venue: "test", market: "equity" as const, active: true, source: "venue-registry", effectiveFrom: 1 }));
  entries.push({ symbol: "M0001", venue: "test", market: "equity", active: true, source: "duplicate", effectiveFrom: 1 });
  const u = normalizeMarketUniverse({ universeId: "u1", version: "v1", asOfTs: 100, entries });
  assert.equal(u.entries.length, 1000);
  assert.equal(new Set(u.entries.map((x) => `${x.venue}:${x.symbol}`)).size, 1000);
  assert.equal(u.entries[0]?.symbol, "M0");
});

test("scanner binds results to authoritative universe identity", async () => {
  const provider: MarketUniverseProvider = { async getUniverse(asOfTs) { return { universeId: "u1", version: "2026-09-12", asOfTs, entries: [{ symbol: "AAA", venue: "test", market: "equity", active: true, source: "venue", effectiveFrom: 1 }] }; } };
  const scanner = new DeterministicMarketScanner({ candidateLimit: 1 });
  const result = await scanner.scanFromUniverse(provider, async (symbols) => symbols.map(symbol => ({ symbol, venue: "test", market: "equity", last: 100, bid: 99.9, ask: 100.1, liquidityScore: 0.9, unusualVolume: 0.9, return1h: 0.1, return24h: 0.1, volatility: 0.1, relativeStrength: 0.9, timestamp: 1000 })), 1000);
  assert.equal(result.universeId, "u1");
  assert.equal(result.universeVersion, "2026-09-12");
  assert.equal(result.universeAsOfTs, 1000);
});

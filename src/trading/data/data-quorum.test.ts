import assert from "node:assert/strict";
import test from "node:test";
import { resolveQuorum } from "./data-quorum.ts";

const policy = { minSources: 2, maxAgeMs: 5_000, minQuality: 0.7, maxDisagreementBps: 100 };

test("quorum accepts fresh agreement and uses median", () => {
  const result = resolveQuorum([
    { sourceId: "a", market: "BTC-USD", asOf: 10_000, value: 100, quality: 0.9 },
    { sourceId: "b", market: "BTC-USD", asOf: 9_900, value: 101, quality: 0.8 },
    { sourceId: "c", market: "BTC-USD", asOf: 9_800, value: 100.5, quality: 0.95 },
  ], 10_500, policy);
  assert.equal(result.value, 100.5);
  assert.deepEqual(result.acceptedSources, ["a", "b", "c"]);
});

test("quorum rejects future and stale observations", () => {
  assert.throws(() => resolveQuorum([
    { sourceId: "a", market: "BTC-USD", asOf: 20_000, value: 100, quality: 0.9 },
    { sourceId: "b", market: "BTC-USD", asOf: 10_000, value: 100, quality: 0.9 },
    { sourceId: "c", market: "BTC-USD", asOf: 5_000, value: 100, quality: 0.9 },
  ], 10_500, policy), /quorum_insufficient_sources/);
});

test("quorum fails on source disagreement", () => {
  assert.throws(() => resolveQuorum([
    { sourceId: "a", market: "BTC-USD", asOf: 10_000, value: 100, quality: 0.9 },
    { sourceId: "b", market: "BTC-USD", asOf: 10_000, value: 103, quality: 0.9 },
  ], 10_500, policy), /quorum_disagreement_exceeded/);
});


test("quorum rejects duplicate source identities", () => {
  assert.throws(() => resolveQuorum([
    { sourceId: "a", market: "BTC-USD", asOf: 10_000, value: 100, quality: 0.9 },
    { sourceId: "a", market: "BTC-USD", asOf: 9_900, value: 101, quality: 0.9 },
  ], 10_500, { minSources: 2, maxAgeMs: 500, minQuality: 0.7, maxDisagreementBps: 50 }), /quorum_duplicate_source_id/);
});

test("quorum refuses multiple source IDs that belong to the same provider", () => {
  assert.throws(() => resolveQuorum([
    { sourceId: "provider-a-feed-1", providerId: "provider-a", market: "BTC-USD", asOf: 10_000, value: 100, quality: 0.9 },
    { sourceId: "provider-a-feed-2", providerId: "provider-a", market: "BTC-USD", asOf: 9_900, value: 100.1, quality: 0.9 },
  ], 10_500, policy), /quorum_duplicate_provider_id/);
});

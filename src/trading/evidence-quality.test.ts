import test from "node:test";
import assert from "node:assert/strict";
import { scoreEvidenceQuality } from "./evidence-quality.ts";

test("evidence quality rewards PIT-safe, fresh, provenance-rich official sources", () => {
  const quality = scoreEvidenceQuality({
    sourceTier: 1,
    eventTs: 1_000,
    publishedTs: 2_000,
    availableTs: 2_000,
    retrievedTs: 2_100,
    asOfTs: 2_100,
    provenance: { source: "fred", url: "https://example.test", retrievedTs: 2_100 },
    requiredProvenance: ["source", "url", "retrievedTs"],
    pointInTimeValid: true,
  });
  assert.equal(quality.score, 1);
});

test("future and incomplete evidence quality is explicitly penalized", () => {
  const quality = scoreEvidenceQuality({
    sourceTier: 0.5,
    eventTs: 1_000,
    publishedTs: 2_000,
    availableTs: 3_000,
    retrievedTs: 3_000,
    asOfTs: 2_500,
    provenance: {},
    requiredProvenance: ["source", "url"],
    pointInTimeValid: false,
    maxFreshnessMs: 1_000,
  });
  assert.ok(quality.score < 0.6);
  assert.ok(quality.reasons.includes("point_in_time_invalid"));
  assert.ok(quality.reasons.includes("provenance_incomplete"));
});

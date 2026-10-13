import assert from "node:assert/strict";
import test from "node:test";
import { AutoResearchFactory } from "./auto-research.ts";

test("auto research rejects temporal leakage", async () => {
  const lab = new AutoResearchFactory();
  const hypothesis = lab.addHypothesis({ hypothesisId: "h1", strategyId: "s1", thesis: "trend", featureSet: ["momentum"], parameters: { lookback: 20 } });
  assert.throws(() => lab.buildArtifact({ artifactId: "a1", hypothesis, factors: [], seed: 1, trainWindow: { start: 0, end: 200 }, testWindow: { start: 100, end: 300 }, sensitivity: {}, bootstrap: { samples: 1000, lower: 0.1, median: 0.2, upper: 0.3 }, multipleTestingPenalty: 0.9, leakageFree: true }), /research_window_leakage/);
});

test("auto research creates reproducible artifact and promotion evidence", async () => {
  const lab = new AutoResearchFactory();
  const hypothesis = lab.addHypothesis({ hypothesisId: "h1", strategyId: "s1", thesis: "trend", featureSet: ["momentum"], parameters: { lookback: 20 } });
  lab.discoverFactor({ factorId: "f1", name: "momentum", expression: "ret_20", rationale: "trend persistence", direction: "higher_is_better", provenance: ["market:close"] });
  const artifact = await lab.buildArtifact({ artifactId: "a1", hypothesis, factors: lab.listFactors(), seed: 1, trainWindow: { start: 0, end: 100 }, testWindow: { start: 101, end: 200 }, sensitivity: { lookback: 0.1 }, bootstrap: { samples: 1000, lower: 0.1, median: 0.2, upper: 0.3 }, multipleTestingPenalty: 0.9, leakageFree: true });
  assert.equal(artifact.artifactHash.length > 0, true);
  assert.equal(lab.evaluatePromotion(artifact).eligible, true);
});

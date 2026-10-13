import assert from "node:assert/strict";
import test from "node:test";
import { benchmarkAgent, rankBenchmarkScores } from "./benchmark-suite.ts";

test("benchmark scores agents under stressed scenarios", () => {
  const agent = { id: "a", decide: () => ({ action: "buy" as const, confidence: 0.8, rationale: "test" }) };
  const score = benchmarkAgent(agent, [
    { id: "normal", market: "BTC-USD", shocks: [] },
    { id: "outage", market: "BTC-USD", shocks: [{ type: "exchange_outage", severity: 1, durationMs: 500 }] },
  ]);
  assert.equal(score.scenarios, 2);
  assert.ok(score.robustness < 1);
});

test("benchmark rankings are deterministic", () => {
  assert.equal(rankBenchmarkScores([
    { agentId: "a", scenarios: 1, executableScenarios: 1, profitableScenarios: 1, averageConfidence: 0.8, robustness: 0.8 },
    { agentId: "b", scenarios: 1, executableScenarios: 1, profitableScenarios: 0, averageConfidence: 0.8, robustness: 0 },
  ])[0].agentId, "a");
});

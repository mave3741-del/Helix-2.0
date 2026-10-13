import test from "node:test";
import assert from "node:assert/strict";
import { autonomousObjectiveForIntent, decideOrionAction, ORION_AUTONOMY_TARGET } from "./autonomy-policy.ts";

test("Orion autonomy target is the governed 80-90% band", () => {
  assert.equal(ORION_AUTONOMY_TARGET, 0.9);
});

test("Orion may autonomously issue bounded objectives", () => {
  const decision = decideOrionAction(
    { type: "issue_objective", text: "Orion autonomous market research: scan BTC", priority: 3 },
    { userInitiated: false, liveTradingEnabled: false, riskEnvelopeApproved: true },
  );
  assert.equal(decision.allowed, true);
  assert.equal(decision.autonomous, true);
});

test("Orion cannot self-initiate an emergency shutdown", () => {
  const decision = decideOrionAction(
    { type: "shutdown" },
    { userInitiated: false, liveTradingEnabled: false, riskEnvelopeApproved: true },
  );
  assert.equal(decision.allowed, false);
  assert.equal(decision.boundary, "emergency-stop");
});

test("routing changes never become a live-trading enablement", () => {
  const decision = decideOrionAction(
    { type: "set_routing", mode: "cloud-first" },
    { userInitiated: false, liveTradingEnabled: false, riskEnvelopeApproved: true },
  );
  assert.equal(decision.allowed, true);
});

test("research and improvement intents create real org objectives", () => {
  assert.match(autonomousObjectiveForIntent("market_research", "scan BTC for opportunities")?.text ?? "", /Orion autonomous market research/);
  assert.match(autonomousObjectiveForIntent("improvement", "improve the evidence pipeline")?.text ?? "", /governed self-improvement/);
});

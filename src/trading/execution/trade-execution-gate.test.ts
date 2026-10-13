import assert from "node:assert/strict";
import test from "node:test";
import { buildPaperOrderIntent } from "./trade-execution-gate.ts";
import type { TradeCandidateDecision } from "../trade-candidate-council.ts";
import type { RiskLimits } from "../../runtime/tools/trading.ts";

const risk: RiskLimits = {
  capital: 100_000,
  maxPositionPct: 0.1,
  maxOrderPct: 0.02,
  maxDailyLossPct: 0.02,
  maxDrawdownPct: 0.1,
  maxLeverage: 2,
};

const decision: TradeCandidateDecision = {
  subjectId: "alpaca:BTC/USD",
  symbol: "BTC/USD",
  venue: "alpaca",
  market: "crypto",
  action: "buy",
  confidence: 0.8,
  weightedScore: 0.62,
  support: 0.8,
  opposition: 0.1,
  riskVetoed: false,
  evidenceIds: ["ev-2", "ev-1"],
  councilIds: ["crypto", "risk", "technical"],
  participantIds: ["W-0001", "W-0436", "W-0721"],
  rationale: ["consensus"],
  eligibleForRiskReview: true,
};

test("builds bounded paper order intent from an approved candidate", () => {
  const result = buildPaperOrderIntent({ decision, price: 50_000, equity: 100_000, risk });
  assert.equal(result.approved, true);
  assert.equal(result.intent?.side, "buy");
  assert.ok((result.intent?.qty ?? 0) > 0);
  assert.ok((result.intent?.notional ?? Infinity) <= 2_000 + 1e-9);
  assert.deepEqual(result.intent?.evidenceIds, ["ev-1", "ev-2"]);
});

test("confidence sizing reduces notional without breaching hard order cap", () => {
  const result = buildPaperOrderIntent({ decision, price: 50_000, equity: 100_000, risk });
  assert.ok((result.intent?.notional ?? Infinity) <= 1_600 + 1e-9);
});

test("rejects candidate blocked by risk council", () => {
  const vetoed = { ...decision, riskVetoed: true };
  const result = buildPaperOrderIntent({ decision: vetoed, price: 50_000, equity: 100_000, risk });
  assert.equal(result.approved, false);
  assert.ok(result.reasons.includes("decision_risk_vetoed"));
});

test("rejects hold/reject actions", () => {
  const hold = { ...decision, action: "hold" as const };
  const result = buildPaperOrderIntent({ decision: hold, price: 50_000, equity: 100_000, risk });
  assert.equal(result.approved, false);
  assert.ok(result.reasons.includes("candidate_action_not_executable"));
});

test("rejects invalid or overheated portfolio state", () => {
  const result = buildPaperOrderIntent({
    decision,
    price: 50_000,
    equity: 100_000,
    risk,
    exposures: [
      { symbol: "NVDA", notional: 200_000, side: "long", market: "equity" },
    ],
  });
  assert.equal(result.approved, false);
  assert.ok(result.reasons.length > 0);
});

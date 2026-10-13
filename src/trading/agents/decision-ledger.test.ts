import assert from "node:assert/strict";
import test from "node:test";
import { DecisionLedger } from "./decision-ledger.ts";

test("decision ledger requires evidence for actionable decisions and back-links outcomes", async () => {
  const ledger = new DecisionLedger();
  await assert.rejects(() => ledger.record({ decisionId: "d1", agentId: "worker-1", market: "BTC/USD", action: "buy", confidence: 0.8, rationale: "trend", evidenceIds: [] }), /evidence_required/);
  await ledger.record({ decisionId: "d1", agentId: "worker-1", market: "BTC/USD", action: "buy", confidence: 0.8, rationale: "trend", evidenceIds: ["e1"], modelProvider: "local", modelVersion: "test", strategyId: "s1" });
  ledger.attachOutcome({ decisionId: "d1", realizedPnl: 12, maxAdverseExcursion: -3, maxFavorableExcursion: 15, outcomeAt: Date.now() });
  assert.deepEqual(ledger.effectiveness("worker-1"), { decisions: 1, wins: 1, losses: 0, winRate: 1, pnl: 12 });
});

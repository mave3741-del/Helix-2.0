import assert from "node:assert/strict";
import test from "node:test";
import { executeApprovedPaperIntent } from "./paper-order-router.ts";
import { ServerTradingRuntime } from "../runtime/runtime.ts";
import { InMemoryTradingEventJournal, InMemoryMarketTickRecorder } from "../runtime/journal.ts";
import { InMemoryTaskQueue } from "../runtime/task-queue.ts";
import { InMemoryRuntimeSnapshotStore } from "../runtime/snapshot.ts";
import { buildPaperOrderIntent } from "./trade-execution-gate.ts";
import { InMemoryStrategyPerformanceStore } from "../post-trade.ts";
import { PaperOperationSession } from "../ops/paper-operations.ts";

function activePaperSession(id = "router-paper-session") { const session = new PaperOperationSession({ sessionId: id, readinessReady: true, ownerApprovalActive: true, liveExecutionEnabled: false }); session.arm(1); session.start(2); return session; }

const risk = { capital: 10_000, maxPositionPct: 0.2, maxOrderPct: 0.02, maxDailyLossPct: 0.02, maxDrawdownPct: 0.1, maxLeverage: 2 };
const tick = { symbol: "BTCUSDT", venue: "paper", market: "crypto" as const, bid: 100, ask: 101, last: 100.5, bidSize: 100, askSize: 100, sequence: 1, exchangeTs: 1_000, receivedTs: 1_001 };

function runtime() {
  return new ServerTradingRuntime({ paperOperationSession: activePaperSession(), capital: 10_000, risk, performanceStore: new InMemoryStrategyPerformanceStore() }, new InMemoryTradingEventJournal(), new InMemoryMarketTickRecorder(), new InMemoryTaskQueue(), new InMemoryRuntimeSnapshotStore());
}

const baseDecision = {
  subjectId: "paper:BTCUSDT", symbol: "BTCUSDT", venue: "paper", market: "crypto" as const, action: "buy" as const,
  confidence: 0.8, weightedScore: 0.7, support: 0.8, opposition: 0.1, riskVetoed: false, evidenceIds: ["ev-1"],
  councilIds: ["crypto", "risk", "technical"], participantIds: ["W-0436", "W-0721", "W-0126"], rationale: ["consensus"], eligibleForRiskReview: true,
};

test("approved candidate intent executes on PaperExchange and returns account feedback", async () => {
  const r = runtime();
  const gate = buildPaperOrderIntent({ decision: baseDecision, price: 101, equity: 10_000, risk });
  assert.equal(gate.approved, true);
  const feedback = await executeApprovedPaperIntent({ runtime: r, gate, tick, strategyId: "s-paper", regime: "trend" });
  assert.equal(feedback.status, "filled");
  assert.equal(feedback.order?.status, "filled");
  assert.equal(feedback.fill.symbol, "BTCUSDT");
  assert.equal(feedback.completedTrades.length, 0);
  assert.ok(feedback.equity > 0);
});

test("sell execution closes a matching strategy lot and produces post-trade feedback", async () => {
  const r = runtime();
  const buyGate = buildPaperOrderIntent({ decision: baseDecision, price: 101, equity: 10_000, risk });
  await executeApprovedPaperIntent({ runtime: r, gate: buyGate, tick, strategyId: "s-paper", regime: "trend" });
  const sellDecision = { ...baseDecision, action: "sell" as const, confidence: 0.9, weightedScore: -0.8, support: 0.1, opposition: 0.8, rationale: ["exit"] };
  const sellGate = buildPaperOrderIntent({ decision: sellDecision, price: 110, equity: r.paper.snapshot().equity, risk, currentPosition: { qty: r.paper.snapshot().positions.BTCUSDT.qty, avgPrice: r.paper.snapshot().positions.BTCUSDT.avgPrice } });
  assert.equal(sellGate.approved, true);
  const closeTick = { ...tick, bid: 110, ask: 111, last: 110.5, sequence: 2, exchangeTs: 2_000, receivedTs: 2_001 };
  const feedback = await executeApprovedPaperIntent({ runtime: r, gate: sellGate, tick: closeTick, strategyId: "s-paper", regime: "trend" });
  assert.equal(feedback.completedTrades.length, 1);
  assert.equal(feedback.completedTrades[0].strategyId, "s-paper");
  assert.ok(feedback.strategySnapshot);
  assert.equal(feedback.strategySnapshot?.tradeCount, 1);
  const workerLearning = await r.feedbackStore.summary("worker", "W-0436");
  const councilLearning = await r.feedbackStore.summary("council", "crypto");
  assert.equal(workerLearning?.tradeCount, 1);
  assert.equal(councilLearning?.tradeCount, 1);
});

test("replaying the same approved intent is idempotent for post-trade learning", async () => {
  const r = runtime();
  const gate = buildPaperOrderIntent({ decision: baseDecision, price: 101, equity: 10_000, risk }, 1234);
  const first = await executeApprovedPaperIntent({ runtime: r, gate, tick, strategyId: "s-paper", regime: "trend" });
  const second = await executeApprovedPaperIntent({ runtime: r, gate, tick, strategyId: "s-paper", regime: "trend" });
  assert.deepEqual(second.fill, first.fill);
  assert.equal(r.postTrade.openLots().length, 1);
  assert.equal(r.postTrade.trades("s-paper").length, 0);
});

test("router refuses unapproved gate results", async () => {
  const rejected = buildPaperOrderIntent({ decision: { ...baseDecision, riskVetoed: true }, price: 101, equity: 10_000, risk });
  await assert.rejects(() => executeApprovedPaperIntent({ runtime: runtime(), gate: rejected, tick, strategyId: "s-paper" }), /paper_execution_requires_approved_intent/);
});

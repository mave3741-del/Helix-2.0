import test from "node:test";
import assert from "node:assert/strict";
import { aggregateTradeCandidateDecision } from "./trade-candidate-council.ts";
import type { PropagatedNewsCandidate } from "./cross-market-propagation.ts";

const candidate: PropagatedNewsCandidate = {
  symbol: "QQQ", venue: "paper", market: "equity", score: 0.78,
  reasons: ["news-impact"], snapshotTs: 1000, sector: "technology",
  newsArticleIds: ["article-1"], newsReasons: ["macro"], newsCouncilIds: ["macro", "technical", "risk", "adversarial"],
  newsBoost: 0.12, propagationBoost: 0.08, propagationSources: ["SPY"], propagationReasons: ["correlation"],
};

test("aggregates multi-council bull thesis into a buy candidate", () => {
  const decision = aggregateTradeCandidateDecision(candidate, [
    { workerId: "W-0001", councilId: "macro", stance: "bull", confidence: 0.9, rationale: "liquidity improving", evidenceIds: ["e1"] },
    { workerId: "W-0002", councilId: "technical", stance: "bull", confidence: 0.8, rationale: "breakout confirmed", evidenceIds: ["e2"] },
    { workerId: "W-0003", councilId: "risk", stance: "bull", confidence: 0.7, rationale: "risk within envelope", evidenceIds: ["e3"] },
    { workerId: "W-0004", councilId: "adversarial", stance: "neutral", confidence: 0.5, rationale: "no fatal contradiction", evidenceIds: ["e4"] },
  ]);
  assert.equal(decision.action, "buy");
  assert.equal(decision.riskVetoed, false);
  assert.equal(decision.eligibleForRiskReview, true);
  assert.equal(decision.evidenceIds.length, 4);
});

test("risk council can veto an otherwise bullish thesis", () => {
  const decision = aggregateTradeCandidateDecision(candidate, [
    { workerId: "W-0001", councilId: "macro", stance: "bull", confidence: 0.95, rationale: "macro supportive", evidenceIds: ["e1"] },
    { workerId: "W-0002", councilId: "technical", stance: "bull", confidence: 0.9, rationale: "trend up", evidenceIds: ["e2"] },
    { workerId: "W-0003", councilId: "risk", stance: "bear", confidence: 0.91, rationale: "drawdown gate breached", evidenceIds: ["e3"] },
  ]);
  assert.equal(decision.action, "reject");
  assert.equal(decision.riskVetoed, true);
  assert.equal(decision.eligibleForRiskReview, false);
});

test("insufficient or missing risk evidence stays on hold", () => {
  const decision = aggregateTradeCandidateDecision(candidate, [
    { workerId: "W-0001", councilId: "macro", stance: "bull", confidence: 0.9, rationale: "supportive", evidenceIds: ["e1"] },
    { workerId: "W-0002", councilId: "technical", stance: "bull", confidence: 0.9, rationale: "supportive", evidenceIds: ["e2"] },
  ]);
  assert.equal(decision.action, "hold");
  assert.equal(decision.eligibleForRiskReview, false);
});

test("balanced debate remains neutral even with multiple councils", () => {
  const decision = aggregateTradeCandidateDecision(candidate, [
    { workerId: "W-0001", councilId: "macro", stance: "bull", confidence: 0.8, rationale: "support", evidenceIds: ["e1"] },
    { workerId: "W-0002", councilId: "technical", stance: "bear", confidence: 0.8, rationale: "resistance", evidenceIds: ["e2"] },
    { workerId: "W-0003", councilId: "risk", stance: "neutral", confidence: 0.8, rationale: "balanced", evidenceIds: ["e3"] },
  ]);
  assert.equal(decision.action, "hold");
  assert.ok(Math.abs(decision.weightedScore) < 0.2);
});

test("debate planning selects named specialists and enqueues idempotent review tasks", async () => {
  const { InMemoryTradingWorkerRegistry } = await import("./runtime/worker-registry.ts");
  const { InMemoryTaskQueue } = await import("./runtime/task-queue.ts");
  const { planTradeCandidateDebate } = await import("./trade-candidate-council.ts");
  const registry = new InMemoryTradingWorkerRegistry();
  await registry.ensureSeeded(1000);
  const queue = new InMemoryTaskQueue();
  const plan = await planTradeCandidateDebate(candidate, registry, queue, 1000);
  assert.ok(plan.participants.length >= 3);
  assert.equal(plan.taskIds.length, plan.participants.length);
  assert.ok(plan.participants.some((worker) => worker.family === "Risk"));
  const stored = await queue.peek(20);
  assert.equal(stored.length, plan.taskIds.length);
  assert.ok(stored.every((task) => task.type === "trade-candidate.debate.review"));
  const second = await planTradeCandidateDebate(candidate, registry, queue, 1000);
  assert.deepEqual(second.taskIds, plan.taskIds);
  const storedAgain = await queue.peek(20);
  assert.equal(storedAgain.length, plan.taskIds.length);
});

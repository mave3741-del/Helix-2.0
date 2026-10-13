import type { PropagatedNewsCandidate } from "./cross-market-propagation.ts";
import type { DebateSession, DebateStance } from "./debate.ts";
import type { TradingWorkerIdentity, TradingWorkerRegistry } from "./runtime/worker-registry.ts";
import type { TaskQueue } from "./runtime/task-queue.ts";

export type TradeCandidateAction = "buy" | "sell" | "hold" | "reject";

export interface CouncilReviewInput {
  workerId: string;
  councilId: string;
  stance: DebateStance;
  confidence: number;
  rationale: string;
  evidenceIds: string[];
}

export interface CouncilDebatePlan {
  session: DebateSession;
  participants: TradingWorkerIdentity[];
  taskIds: string[];
}

export interface TradeCandidateDecision {
  subjectId: string;
  symbol: string;
  venue: string;
  market: string;
  action: TradeCandidateAction;
  confidence: number;
  weightedScore: number;
  support: number;
  opposition: number;
  riskVetoed: boolean;
  evidenceIds: string[];
  councilIds: string[];
  participantIds: string[];
  rationale: string[];
  eligibleForRiskReview: boolean;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) throw new Error("invalid_trade_candidate_number");
  return Math.max(0, Math.min(1, value));
}

function stanceWeight(stance: DebateStance): number {
  switch (stance) {
    case "bull": return 1;
    case "bear": return -1;
    case "neutral": return 0;
    case "abstain": return 0;
  }
}

function stableUnique(values: string[]): string[] {
  return [...new Set(values)].sort();
}

function councilFamily(councilId: string): string | undefined {
  const map: Record<string, string> = {
    macro: "Macro", fundamental: "Fundamental", technical: "Technical", quant: "Quant",
    derivatives: "Derivatives", crypto: "Crypto", news: "News", strategy: "Strategy",
    risk: "Risk", execution: "Execution", adversarial: "Adversarial", knowledge: "Knowledge",
  };
  return map[councilId];
}

export async function planTradeCandidateDebate(
  candidate: PropagatedNewsCandidate,
  registry: TradingWorkerRegistry,
  queue: TaskQueue,
  now = Date.now(),
): Promise<CouncilDebatePlan> {
  const councilIds = stableUnique(candidate.newsCouncilIds);
  const selected: TradingWorkerIdentity[] = [];

  for (const councilId of councilIds) {
    const family = councilFamily(councilId);
    if (!family) continue;
    const preferred = await registry.list({ family, market: candidate.market, availableOnly: true });
    const fallback = preferred.length ? preferred : await registry.list({ family, availableOnly: true });
    const worker = fallback[0];
    if (worker && !selected.some((entry) => entry.workerId === worker.workerId)) selected.push(worker);
    if (selected.length >= 12) break;
  }

  if (selected.length < 3) throw new Error("insufficient_council_participants");

  const sessionId = `trade-candidate:${candidate.venue}:${candidate.symbol}:${candidate.newsArticleIds.slice().sort().join("|") || "market"}`;
  const session: DebateSession = {
    sessionId,
    subjectId: `${candidate.venue}:${candidate.symbol}`,
    topic: `Trade candidate review for ${candidate.symbol}`,
    status: "open",
    currentRound: 1,
    participants: selected.map((worker) => worker.workerId),
    councilIds,
    decision: null,
    createdAt: now,
    updatedAt: now,
    finalizedAt: null,
  };

  const taskIds: string[] = [];
  for (const worker of selected) {
    const taskId = `trade-candidate:debate:${sessionId}:${worker.workerId}`;
    await queue.enqueue({
      id: taskId,
      type: "trade-candidate.debate.review",
      payload: {
        candidate,
        sessionId,
        round: 1,
        workerId: worker.workerId,
        councilId: councilIds.find((id) => councilFamily(id) === worker.family) ?? "unknown",
      },
    });
    taskIds.push(taskId);
  }

  return { session, participants: selected, taskIds };
}

export interface ReconciledCouncilVote {
  action: TradeCandidateAction;
  confidence: number;
  weightedScore: number;
  support: number;
  opposition: number;
  riskVetoed: boolean;
  hasRiskReview: boolean;
  evidenceIds: string[];
  councilIds: string[];
  participantIds: string[];
  rationale: string[];
}

/**
 * The shared confidence-weighted voting + absolute risk-veto math used by every
 * council decision pipeline (news-propagated trade candidates today, native
 * quant-signal decisions for the paper-trading bridge, and — later — real
 * LLM-driven multi-round debate turns). Keeping this in one place means every
 * caller gets the same risk-veto semantics instead of re-implementing it.
 */
export function reconcileCouncilReviews(reviews: CouncilReviewInput[]): ReconciledCouncilVote {
  const normalized = reviews
    .map((review) => ({
      ...review,
      confidence: clamp01(review.confidence),
      evidenceIds: stableUnique(review.evidenceIds),
    }))
    .filter((review) => review.confidence > 0);

  const participantIds = stableUnique(normalized.map((review) => review.workerId));
  const councilIds = stableUnique(normalized.map((review) => review.councilId));
  const evidenceIds = stableUnique(normalized.flatMap((review) => review.evidenceIds));
  const weighted = normalized.reduce((sum, review) => sum + stanceWeight(review.stance) * review.confidence, 0);
  const totalWeight = normalized.reduce((sum, review) => sum + review.confidence, 0);
  const weightedScore = totalWeight ? weighted / totalWeight : 0;
  const support = totalWeight ? normalized.filter((review) => review.stance === "bull").reduce((sum, review) => sum + review.confidence, 0) / totalWeight : 0;
  const opposition = totalWeight ? normalized.filter((review) => review.stance === "bear").reduce((sum, review) => sum + review.confidence, 0) / totalWeight : 0;

  const riskVetoed = normalized.some((review) => review.councilId === "risk" && review.stance === "bear" && review.confidence >= 0.8);
  const hasRiskReview = normalized.some((review) => review.councilId === "risk");
  const confidence = clamp01(Math.min(0.99, Math.abs(weightedScore) * 0.7 + Math.min(0.3, participantIds.length * 0.03)));

  let action: TradeCandidateAction = "hold";
  if (riskVetoed) action = "reject";
  else if (participantIds.length < 3 || !hasRiskReview || Math.abs(weightedScore) < 0.2) action = "hold";
  else if (weightedScore > 0) action = "buy";
  else if (weightedScore < 0) action = "sell";

  const rationale = [
    `participants=${participantIds.length}`,
    `councils=${councilIds.length}`,
    `weighted_score=${weightedScore.toFixed(3)}`,
    `support=${support.toFixed(3)}`,
    `opposition=${opposition.toFixed(3)}`,
    `risk_vetoed=${riskVetoed}`,
    `risk_review_present=${hasRiskReview}`,
  ];

  return { action, confidence, weightedScore, support, opposition, riskVetoed, hasRiskReview, evidenceIds, councilIds, participantIds, rationale };
}

export function aggregateTradeCandidateDecision(
  candidate: PropagatedNewsCandidate,
  reviews: CouncilReviewInput[],
): TradeCandidateDecision {
  if (!candidate.symbol.trim()) throw new Error("trade_candidate_symbol_required");
  const reconciled = reconcileCouncilReviews(reviews);

  return {
    subjectId: `${candidate.venue}:${candidate.symbol}`,
    symbol: candidate.symbol,
    venue: candidate.venue,
    market: candidate.market,
    action: reconciled.action,
    confidence: reconciled.confidence,
    weightedScore: reconciled.weightedScore,
    support: reconciled.support,
    opposition: reconciled.opposition,
    riskVetoed: reconciled.riskVetoed,
    evidenceIds: reconciled.evidenceIds,
    councilIds: reconciled.councilIds,
    participantIds: reconciled.participantIds,
    rationale: reconciled.rationale,
    eligibleForRiskReview: reconciled.action !== "reject" && reconciled.evidenceIds.length > 0 && reconciled.hasRiskReview,
  };
}

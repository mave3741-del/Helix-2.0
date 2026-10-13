import type { StrategyExperimentSnapshot } from '../portfolio-ensemble.ts';
import { scoreStrategies } from '../portfolio-ensemble.ts';

export interface AdaptiveAllocationPolicy {
  capital: number;
  maxStrategies: number;
  maxStrategyPct: number;
  minStrategyPct: number;
  correlationPenalty: number;
  minRobustness: number;
}

export interface AdaptiveAllocation {
  strategyId: string;
  weight: number;
  capital: number;
  score: number;
  rationale: string[];
}

export function buildAdaptiveAllocations(snapshots: StrategyExperimentSnapshot[], policy: AdaptiveAllocationPolicy): AdaptiveAllocation[] {
  if (!(policy.capital > 0) || policy.maxStrategies < 1 || policy.maxStrategyPct <= 0 || policy.maxStrategyPct > 1) throw new Error('invalid_adaptive_allocation_policy');
  const scored = scoreStrategies(snapshots)
    .filter((x) => {
      const snapshot = snapshots.find((s) => s.strategyId === x.strategyId)!;
      return snapshot.robustness >= policy.minRobustness && x.reasons.length < 2;
    })
    .slice(0, policy.maxStrategies);
  if (!scored.length) return [];
  const raw = scored.map((x) => ({ ...x, positive: Math.max(0, x.score) * Math.max(0.1, 1 - Math.abs(snapshots.find((s) => s.strategyId === x.strategyId)!.correlationToPortfolio) * policy.correlationPenalty) }));
  const total = raw.reduce((s, x) => s + x.positive, 0) || raw.length;
  const preliminary = raw.map((x) => ({ ...x, weight: x.positive > 0 ? x.positive / total : 1 / raw.length }));
  let weights = preliminary.map((x) => Math.min(policy.maxStrategyPct, Math.max(policy.minStrategyPct, x.weight)));
  const sum = weights.reduce((s, x) => s + x, 0);
  if (sum > 1) weights = weights.map((w) => w / sum);
  else if (sum < 1) {
    const remaining = 1 - sum;
    const room = weights.map((w) => Math.max(0, policy.maxStrategyPct - w));
    const roomTotal = room.reduce((s, x) => s + x, 0);
    if (roomTotal > 0) weights = weights.map((w, i) => w + remaining * room[i] / roomTotal);
  }
  return preliminary.map((x, i) => ({ strategyId: x.strategyId, weight: weights[i], capital: policy.capital * weights[i], score: x.score, rationale: [Math.abs(snapshots.find((s) => s.strategyId === x.strategyId)!.correlationToPortfolio) > 0.7 ? 'correlation_penalty_applied' : 'diversification_ok'] }));
}

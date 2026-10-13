import type { MemberFeedbackSummary } from '../post-trade-feedback.ts';
import type { StrategyExperimentSnapshot } from '../portfolio-ensemble.ts';

export interface StrategyAdaptationInput {
  snapshot: StrategyExperimentSnapshot;
  feedback?: MemberFeedbackSummary[];
  currentWeight?: number;
}

export interface StrategyAdaptationPolicy {
  maxIncreasePct: number;
  maxDecreasePct: number;
  minWeight: number;
  maxWeight: number;
  reliabilityFloor: number;
  robustnessFloor: number;
}

export interface StrategyAdaptationDecision {
  strategyId: string;
  baseWeight: number;
  targetWeight: number;
  delta: number;
  action: 'increase' | 'decrease' | 'maintain' | 'quarantine';
  reliability: number;
  rationale: string[];
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

export function adaptStrategyWeight(input: StrategyAdaptationInput, policy: StrategyAdaptationPolicy): StrategyAdaptationDecision {
  const baseWeight = clamp(input.currentWeight ?? 0, 0, 1);
  const feedback = input.feedback ?? [];
  const reliability = feedback.length ? feedback.reduce((s, x) => s + x.reliability, 0) / feedback.length : 0.5;
  const rationale: string[] = [];
  if (input.snapshot.robustness < policy.robustnessFloor) {
    rationale.push('robustness_below_adaptation_floor');
    return { strategyId: input.snapshot.strategyId, baseWeight, targetWeight: 0, delta: -baseWeight, action: 'quarantine', reliability, rationale };
  }
  if (feedback.length && reliability < policy.reliabilityFloor) {
    rationale.push('member_reliability_below_floor');
    const target = clamp(baseWeight * (1 - policy.maxDecreasePct), policy.minWeight, policy.maxWeight);
    return { strategyId: input.snapshot.strategyId, baseWeight, targetWeight: target, delta: target - baseWeight, action: 'decrease', reliability, rationale };
  }
  if (input.snapshot.maxDrawdown > 0.2) rationale.push('drawdown_penalty');
  if (input.snapshot.correlationToPortfolio > 0.85) rationale.push('high_portfolio_correlation');
  const quality = clamp(0.5 + input.snapshot.sharpe * 0.08 + input.snapshot.robustness * 0.25 - Math.max(0, input.snapshot.maxDrawdown) * 0.5 - Math.abs(input.snapshot.correlationToPortfolio) * 0.1, 0, 1);
  const direction = quality >= 0.6 ? 1 : quality <= 0.4 ? -1 : 0;
  const delta = direction > 0 ? baseWeight * policy.maxIncreasePct : direction < 0 ? -baseWeight * policy.maxDecreasePct : 0;
  const targetWeight = clamp(baseWeight + delta, policy.minWeight, policy.maxWeight);
  if (direction > 0) { rationale.push('quality_supports_increase'); return { strategyId: input.snapshot.strategyId, baseWeight, targetWeight, delta: targetWeight - baseWeight, action: 'increase', reliability, rationale }; }
  if (direction < 0) { rationale.push('quality_supports_decrease'); return { strategyId: input.snapshot.strategyId, baseWeight, targetWeight, delta: targetWeight - baseWeight, action: 'decrease', reliability, rationale }; }
  rationale.push('quality_neutral');
  return { strategyId: input.snapshot.strategyId, baseWeight, targetWeight, delta: 0, action: 'maintain', reliability, rationale };
}

export function adaptStrategyWeights(inputs: StrategyAdaptationInput[], policy: StrategyAdaptationPolicy): StrategyAdaptationDecision[] {
  return inputs.map((input) => adaptStrategyWeight(input, policy));
}

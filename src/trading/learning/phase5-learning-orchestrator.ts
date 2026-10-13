import { createHash } from 'node:crypto';
import type { MemberFeedbackSummary } from '../post-trade-feedback.ts';
import type { StrategyExperimentSnapshot } from '../portfolio-ensemble.ts';
import { adaptStrategyWeights, type StrategyAdaptationDecision, type StrategyAdaptationPolicy } from './strategy-adaptation.ts';
import type { ChampionRotationInput, ChampionRotationResult } from './champion-rotation.ts';
import { evaluateChampionRotation } from './champion-rotation.ts';
import type { AdaptiveAllocation, AdaptiveAllocationPolicy } from '../portfolio/adaptive-allocation.ts';
import { buildAdaptiveAllocations } from '../portfolio/adaptive-allocation.ts';
import type { ExecutionQualityFeedback } from '../execution/execution-quality-feedback.ts';

export interface Phase5LearningInput {
  cycleId: string;
  snapshots: StrategyExperimentSnapshot[];
  feedbackByStrategy: Record<string, MemberFeedbackSummary[]>;
  currentWeights: Record<string, number>;
  adaptationPolicy: StrategyAdaptationPolicy;
  allocationPolicy: AdaptiveAllocationPolicy;
  championRotation: ChampionRotationInput;
  executionFeedback: ExecutionQualityFeedback[];
}

export interface Phase5LearningResult {
  cycleId: string;
  strategyAdaptation: StrategyAdaptationDecision[];
  allocations: AdaptiveAllocation[];
  championRotation: ChampionRotationResult;
  executionThrottle: Record<string, number>;
  failClosed: boolean;
  reasons: string[];
  decisionHash: string;
}

export function runPhase5LearningCycle(input: Phase5LearningInput): Phase5LearningResult {
  const reasons: string[] = [];
  const strategyAdaptation = adaptStrategyWeights(input.snapshots.map((snapshot) => ({ snapshot, currentWeight: input.currentWeights[snapshot.strategyId] ?? 0, feedback: input.feedbackByStrategy[snapshot.strategyId] ?? [] })), input.adaptationPolicy);
  const allocations = buildAdaptiveAllocations(input.snapshots.filter((s) => strategyAdaptation.find((a) => a.strategyId === s.strategyId)?.action !== 'quarantine'), input.allocationPolicy);
  const championRotation = evaluateChampionRotation(input.championRotation);
  const executionThrottle: Record<string, number> = {};
  for (const feedback of input.executionFeedback) executionThrottle[`${feedback.strategyId}:${feedback.symbol}`] = feedback.executionAdjustment;
  if (!allocations.length) reasons.push('no_strategy_received_adaptive_allocation');
  if (input.executionFeedback.some((x) => x.action === 'throttle')) reasons.push('execution_quality_requires_throttling');
  if (championRotation.promotedChampion && !input.championRotation.challengerMetrics.some((m) => m.strategyId === championRotation.promotedChampion)) reasons.push('promotion_integrity_failure');
  const failClosed = reasons.includes('promotion_integrity_failure');
  const payload = { cycleId: input.cycleId, strategyAdaptation, allocations, championRotation, executionThrottle, failClosed, reasons };
  const decisionHash = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  return { ...payload, decisionHash };
}

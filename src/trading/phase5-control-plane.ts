import { buildRiskBudget, type RiskBudgetAllocation, type RiskBudgetPolicy } from './portfolio/risk-budget.ts';
import { sizeForLiquidity, type LiquiditySizingResult } from './execution/liquidity-sizing.ts';
import { evaluateLearningAdmission } from './learning/learning-admission.ts';
import type { PaperObservationCycle, PaperObservationPolicy } from './observation/paper-observation.ts';
import type { VenueQuote } from './execution/execution-intelligence.ts';
import { runPhase5LearningCycle, type Phase5LearningInput, type Phase5LearningResult } from './learning/phase5-learning-orchestrator.ts';
import { buildLearningAuditEntry, type LearningAuditEntry } from './learning/learning-audit-ledger.ts';

export interface Phase5ControlPlaneInput {
  learning: Phase5LearningInput;
  riskBudget: RiskBudgetPolicy;
  regime: string;
  observationCycles: PaperObservationCycle[];
  observationPolicy: PaperObservationPolicy;
  learningHealth: boolean;
  liquidity: {
    desiredQty: number;
    side: 'buy' | 'sell';
    maxParticipationPct: number;
    throttleMultiplier?: number;
    riskCapital?: number;
    referencePrice?: number;
    quote: VenueQuote;
  };
  previousAuditHash?: string | null;
  createdAt?: number;
}

export interface Phase5ControlPlaneResult {
  admitted: boolean;
  riskBudget: RiskBudgetAllocation;
  liquiditySizing: LiquiditySizingResult;
  learning: Phase5LearningResult | null;
  audit: LearningAuditEntry | null;
  reasons: string[];
}

export function runPhase5ControlPlane(input: Phase5ControlPlaneInput): Phase5ControlPlaneResult {
  const reasons: string[] = [];
  const riskBudget = buildRiskBudget(input.riskBudget, input.regime, input.learning.snapshots.map((x) => x.strategyId));
  const liquiditySizing = sizeForLiquidity(input.liquidity);
  const admission = evaluateLearningAdmission(input.observationCycles, input.observationPolicy, input.learningHealth);
  if (!admission.admitted) reasons.push(...admission.reasons);
  if (liquiditySizing.approvedQty <= 0) reasons.push('liquidity_sizing_zero');
  if (reasons.length) return { admitted: false, riskBudget, liquiditySizing, learning: null, audit: null, reasons };
  const learning = runPhase5LearningCycle(input.learning);
  if (learning.failClosed) reasons.push(...learning.reasons);
  const audit = buildLearningAuditEntry(learning, input.previousAuditHash ?? null, input.createdAt ?? Date.now());
  return { admitted: !learning.failClosed, riskBudget, liquiditySizing, learning, audit, reasons };
}

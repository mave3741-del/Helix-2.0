import { createHash } from 'node:crypto';
import { evaluateDeploymentSandbox } from '../runtime/deployment-sandbox-policy.ts';
import type { DeploymentSandboxAttestation } from '../runtime/deployment-sandbox.ts';
import type { ReadinessReport } from '../readiness.ts';

export type CanaryStage = 'paper-rehearsal' | 'live-review';

export interface CanaryMetrics {
  observationCycles: number;
  rejectedOrders: number;
  reconciliationMismatches: number;
  criticalAlerts: number;
  p95LatencyMs: number;
}

export interface CanaryPolicy {
  minimumObservationCycles: number;
  maximumRejectedOrderRate: number;
  maximumReconciliationMismatches: number;
  maximumCriticalAlerts: number;
  maximumP95LatencyMs: number;
}

export const DEFAULT_CANARY_POLICY: CanaryPolicy = {
  minimumObservationCycles: 20,
  maximumRejectedOrderRate: 0.10,
  maximumReconciliationMismatches: 0,
  maximumCriticalAlerts: 0,
  maximumP95LatencyMs: 2_000,
};

export interface ControlledReadinessInput {
  stage: CanaryStage;
  readiness: ReadinessReport;
  deploymentEnv?: Record<string, string | undefined>;
  ownerCapitalApprovalActive: boolean;
  liveExecutionEnabled: boolean;
  metrics: CanaryMetrics;
  policy?: CanaryPolicy;
}

export interface ControlledReadinessResult {
  allowed: boolean;
  stage: CanaryStage;
  reasons: string[];
  deployment: DeploymentSandboxAttestation & { ready: boolean };
  attestationHash: string;
}

export function evaluateControlledReadiness(input: ControlledReadinessInput): ControlledReadinessResult {
  const policy = input.policy ?? DEFAULT_CANARY_POLICY;
  const deployment = evaluateDeploymentSandbox(input.deploymentEnv ?? process.env);
  const reasons: string[] = [];
  if (!input.readiness.readyForLive) reasons.push('readiness_report_not_ready');
  if (!deployment.ready) reasons.push(...deployment.reasons.map((reason) => `deployment:${reason}`));
  if (!input.readiness.gates.every((gate) => !gate.required || gate.ok)) reasons.push(...input.readiness.reasons.map((reason) => `readiness:${reason}`));
  if (!input.ownerCapitalApprovalActive) reasons.push('owner_capital_approval_not_active');
  if (input.metrics.observationCycles < policy.minimumObservationCycles) reasons.push('insufficient_canary_observation_cycles');
  const rejectionRate = input.metrics.observationCycles > 0 ? input.metrics.rejectedOrders / input.metrics.observationCycles : 1;
  if (rejectionRate > policy.maximumRejectedOrderRate) reasons.push('canary_rejection_rate_exceeded');
  if (input.metrics.reconciliationMismatches > policy.maximumReconciliationMismatches) reasons.push('canary_reconciliation_mismatch');
  if (input.metrics.criticalAlerts > policy.maximumCriticalAlerts) reasons.push('canary_critical_alerts_present');
  if (input.metrics.p95LatencyMs > policy.maximumP95LatencyMs) reasons.push('canary_latency_exceeded');

  if (input.stage === 'paper-rehearsal') {
    if (input.liveExecutionEnabled) reasons.push('paper_rehearsal_must_not_enable_live_execution');
  }
  if (input.stage === 'live-review' && !input.liveExecutionEnabled) reasons.push('live-review-live-execution-not-enabled');

  const payload = { stage: input.stage, readiness: input.readiness, deployment, ownerCapitalApprovalActive: input.ownerCapitalApprovalActive, liveExecutionEnabled: input.liveExecutionEnabled, metrics: input.metrics, policy };
  const attestationHash = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  return { allowed: reasons.length === 0, stage: input.stage, reasons: [...new Set(reasons)].sort(), deployment, attestationHash };
}

export function assertControlledReadiness(result: ControlledReadinessResult): void {
  if (!result.allowed) throw new Error(`controlled_readiness_not_allowed:${result.reasons.join(',')}`);
}

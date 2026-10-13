import { createHash, randomUUID } from 'node:crypto';
import { evaluateConnectorReadiness, type ConnectorReadinessInput, type ConnectorReadinessResult } from '../data/connector-readiness.ts';
import { evaluateMarketDataHealth, type DataHealthPolicy, type DataSourceHealth, type MarketDataHealthResult } from '../data/data-health.ts';
import { ObservabilityBus, type ObservabilitySnapshot, type ObservabilityThresholds } from './observability.ts';

export interface StagingBootstrapInput {
  environment: 'staging' | 'production';
  deploymentId?: string;
  region?: string;
  databaseUrlPresent: boolean;
  secretsExternal: boolean;
  egressAllowlistVerified: boolean;
  liveExecutionEnabled: boolean;
}

export interface StagingBootstrapAttestation {
  status: 'ready' | 'blocked';
  environment: string;
  deploymentId: string;
  reasons: string[];
  attestationHash: string;
}

export function attestStagingBootstrap(input: StagingBootstrapInput): StagingBootstrapAttestation {
  const reasons: string[] = [];
  if (input.environment !== 'staging' && input.environment !== 'production') reasons.push('invalid_environment');
  if (!input.databaseUrlPresent) reasons.push('database_url_missing');
  if (!input.secretsExternal) reasons.push('secrets_must_be_external');
  if (!input.egressAllowlistVerified) reasons.push('egress_allowlist_not_verified');
  if (input.liveExecutionEnabled) reasons.push('live_execution_forbidden_during_bootstrap');
  const payload = {
    environment: input.environment,
    deploymentId: input.deploymentId?.trim() || randomUUID(),
    region: input.region?.trim() || 'unspecified',
    reasons: [...reasons].sort(),
  };
  return {
    status: reasons.length ? 'blocked' : 'ready',
    environment: input.environment,
    deploymentId: payload.deploymentId,
    reasons: [...new Set(reasons)].sort(),
    attestationHash: createHash('sha256').update(JSON.stringify(payload)).digest('hex'),
  };
}

export interface DatabaseVerificationResult {
  status: 'verified' | 'blocked';
  mode: 'external-postgres' | 'pglite-smoke';
  migrationCount: number;
  reasons: string[];
}

export function evaluateDatabaseVerification(input: {
  databaseUrlPresent: boolean;
  migrationIntegrityPass: boolean;
  requiredSchemaPass: boolean;
  migrationCount: number;
}): DatabaseVerificationResult {
  const reasons: string[] = [];
  const mode = input.databaseUrlPresent ? 'external-postgres' : 'pglite-smoke';
  if (!input.migrationIntegrityPass) reasons.push('migration_integrity_failed');
  if (!input.requiredSchemaPass) reasons.push('required_schema_verification_failed');
  if (input.migrationCount <= 0) reasons.push('no_migrations_verified');
  if (!input.databaseUrlPresent) reasons.push('external_database_url_missing');
  return { status: reasons.length ? 'blocked' : 'verified', mode, migrationCount: input.migrationCount, reasons };
}

export interface ConnectorPermissionAttestation {
  status: 'ready' | 'blocked';
  connectors: ConnectorReadinessResult[];
  reasons: string[];
  attestationHash: string;
}

export async function attestConnectors(inputs: ConnectorReadinessInput[]): Promise<ConnectorPermissionAttestation> {
  const connectors = await Promise.all(inputs.map((input) => evaluateConnectorReadiness(input)));
  const reasons = connectors.flatMap((connector) => connector.reasons.map((reason) => `${connector.id}:${reason}`));
  const payload = connectors.map(({ id, status, reasons: connectorReasons, decisionHash }) => ({ id, status, reasons: [...connectorReasons].sort(), decisionHash }));
  return {
    status: reasons.length ? 'blocked' : 'ready',
    connectors,
    reasons: [...new Set(reasons)].sort(),
    attestationHash: createHash('sha256').update(JSON.stringify(payload)).digest('hex'),
  };
}

export interface RuntimeSandboxProbe {
  contractPass: boolean;
  workerBuiltinBlockPass: boolean;
  rawKeysDenied: boolean;
  networkPolicy: 'deny' | 'allowlist' | 'unknown';
}

export function evaluateSandboxProbe(input: RuntimeSandboxProbe): { status: 'verified' | 'blocked'; reasons: string[] } {
  const reasons: string[] = [];
  if (!input.contractPass) reasons.push('deployment_sandbox_contract_failed');
  if (!input.workerBuiltinBlockPass) reasons.push('worker_builtin_escape_probe_failed');
  if (!input.rawKeysDenied) reasons.push('raw_keys_not_denied');
  if (input.networkPolicy !== 'deny' && input.networkPolicy !== 'allowlist') reasons.push('network_policy_not_restricted');
  return { status: reasons.length ? 'blocked' : 'verified', reasons };
}

export interface IncidentDrillResult {
  status: 'pass' | 'fail';
  triggeredAlerts: string[];
  snapshot: ObservabilitySnapshot;
}

export function runIncidentDrill(thresholds: ObservabilityThresholds = { maxCriticalEvents: 0, maxErrorRate: 0.05, maxLatencyMs: 1_000 }): IncidentDrillResult {
  const bus = new ObservabilityBus();
  for (let i = 0; i < 20; i += 1) bus.recordRequest(50 + i, true);
  bus.recordRequest(1_500, false);
  bus.recordRequest(1_500, false);
  bus.emit({ severity: 'critical', name: 'incident_drill', message: 'synthetic failover alarm', attributes: { drill: true } });
  const snapshot = bus.snapshot(thresholds);
  const required = new Set(['error_rate_threshold', 'latency_threshold', 'critical_event_threshold']);
  const triggeredAlerts = snapshot.alerts.filter((alert) => required.has(alert));
  return { status: required.size === triggeredAlerts.length ? 'pass' : 'fail', triggeredAlerts, snapshot };
}

export interface PaperCanaryPolicy {
  minimumObservationCycles: number;
  maximumRejectedOrderRate: number;
  maximumReconciliationMismatches: number;
  maximumCriticalAlerts: number;
  maximumP95LatencyMs: number;
}

export interface PaperCanaryInput {
  liveExecutionEnabled: boolean;
  readinessGatesHealthy: boolean;
  metrics: {
    observationCycles: number;
    rejectedOrders: number;
    reconciliationMismatches: number;
    criticalAlerts: number;
    p95LatencyMs: number;
  };
  policy?: PaperCanaryPolicy;
}

export interface PaperCanaryResult {
  status: 'ready' | 'blocked';
  reasons: string[];
  attestationHash: string;
}

export function evaluatePaperCanary(input: PaperCanaryInput): PaperCanaryResult {
  const policy = input.policy ?? { minimumObservationCycles: 20, maximumRejectedOrderRate: 0.10, maximumReconciliationMismatches: 0, maximumCriticalAlerts: 0, maximumP95LatencyMs: 2_000 };
  const reasons: string[] = [];
  if (input.liveExecutionEnabled) reasons.push('live_execution_must_remain_disabled');
  if (!input.readinessGatesHealthy) reasons.push('readiness_gates_not_healthy');
  if (input.metrics.observationCycles < policy.minimumObservationCycles) reasons.push('insufficient_observation_cycles');
  const rejectionRate = input.metrics.observationCycles > 0 ? input.metrics.rejectedOrders / input.metrics.observationCycles : 1;
  if (rejectionRate > policy.maximumRejectedOrderRate) reasons.push('rejection_rate_exceeded');
  if (input.metrics.reconciliationMismatches > policy.maximumReconciliationMismatches) reasons.push('reconciliation_mismatch');
  if (input.metrics.criticalAlerts > policy.maximumCriticalAlerts) reasons.push('critical_alerts_present');
  if (input.metrics.p95LatencyMs > policy.maximumP95LatencyMs) reasons.push('latency_exceeded');
  const payload = { input: { ...input, policy }, reasons: [...reasons].sort() };
  return { status: reasons.length ? 'blocked' : 'ready', reasons: [...new Set(reasons)].sort(), attestationHash: createHash('sha256').update(JSON.stringify(payload)).digest('hex') };
}

export interface IndependentReviewInput {
  implementationHash: string;
  testEvidenceHash: string;
  reviewerId: string;
  implementerId: string;
  conflictsDeclared: boolean;
  openCriticalFindings: number;
}

export function evaluateIndependentReview(input: IndependentReviewInput): { status: 'approved' | 'blocked'; reasons: string[]; reviewHash: string } {
  const reasons: string[] = [];
  if (!input.implementationHash.trim()) reasons.push('implementation_evidence_missing');
  if (!input.testEvidenceHash.trim()) reasons.push('test_evidence_missing');
  if (!input.reviewerId.trim()) reasons.push('reviewer_missing');
  if (!input.implementerId.trim()) reasons.push('implementer_missing');
  if (input.reviewerId === input.implementerId) reasons.push('reviewer_must_differ_from_implementer');
  if (!input.conflictsDeclared) reasons.push('conflict_attestation_missing');
  if (input.openCriticalFindings > 0) reasons.push('open_critical_findings');
  const payload = { ...input, reasons: [...reasons].sort() };
  return { status: reasons.length ? 'blocked' : 'approved', reasons: [...new Set(reasons)].sort(), reviewHash: createHash('sha256').update(JSON.stringify(payload)).digest('hex') };
}

export function evaluatePhase6DataHealth(sources: DataSourceHealth[], now: number, policy: DataHealthPolicy): MarketDataHealthResult {
  return evaluateMarketDataHealth(sources, now, policy);
}

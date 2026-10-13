import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateControlledReadiness } from './controlled-readiness.ts';
import type { ReadinessReport } from '../readiness.ts';

const cleanDeployment = {
  HELIX_DEPLOYMENT_SANDBOX: 'container', HELIX_NETWORK_POLICY: 'allowlist', HELIX_FILESYSTEM_POLICY: 'isolated', HELIX_RAW_KEYS_DENIED: 'true', HELIX_PRIVILEGE_RESTRICTED: 'true',
};

const healthyReadiness: ReadinessReport = { readyForLive: true, generatedAt: 1, reasons: [], gates: [
  { id: 'risk', ok: true, required: true, reasons: [] }, { id: 'data', ok: true, required: true, reasons: [] }, { id: 'research', ok: true, required: true, reasons: [] },
  { id: 'paper', ok: true, required: true, reasons: [] }, { id: 'security', ok: true, required: true, reasons: [] }, { id: 'connectors', ok: true, required: true, reasons: [] },
  { id: 'deployment-sandbox', ok: true, required: true, reasons: [] }, { id: 'governance', ok: true, required: true, reasons: [] }, { id: 'observability', ok: true, required: true, reasons: [] },
  { id: 'operational-health', ok: true, required: true, reasons: [] },
] };

test('paper rehearsal passes with clean deployment and canary metrics while live stays disabled', () => {
  const result = evaluateControlledReadiness({ stage: 'paper-rehearsal', readiness: healthyReadiness, deploymentEnv: cleanDeployment, ownerCapitalApprovalActive: true, liveExecutionEnabled: false, metrics: { observationCycles: 25, rejectedOrders: 1, reconciliationMismatches: 0, criticalAlerts: 0, p95LatencyMs: 100 } });
  assert.equal(result.allowed, true);
  assert.equal(result.reasons.length, 0);
  assert.equal(result.attestationHash.length, 64);
});

test('live review fails closed unless live execution is explicitly enabled', () => {
  const result = evaluateControlledReadiness({ stage: 'live-review', readiness: healthyReadiness, deploymentEnv: cleanDeployment, ownerCapitalApprovalActive: true, liveExecutionEnabled: false, metrics: { observationCycles: 25, rejectedOrders: 1, reconciliationMismatches: 0, criticalAlerts: 0, p95LatencyMs: 100 } });
  assert.equal(result.allowed, false);
  assert.ok(result.reasons.includes('live-review-live-execution-not-enabled'));
});

test('canary fails on any reconciliation mismatch by default', () => {
  const result = evaluateControlledReadiness({ stage: 'paper-rehearsal', readiness: healthyReadiness, deploymentEnv: cleanDeployment, ownerCapitalApprovalActive: true, liveExecutionEnabled: false, metrics: { observationCycles: 25, rejectedOrders: 1, reconciliationMismatches: 1, criticalAlerts: 0, p95LatencyMs: 100 } });
  assert.equal(result.allowed, false);
  assert.ok(result.reasons.includes('canary_reconciliation_mismatch'));
});

test('canary refuses a contradictory readiness report', () => {
  const blocked = { ...healthyReadiness, readyForLive: false };
  const result = evaluateControlledReadiness({ stage: 'paper-rehearsal', readiness: blocked, deploymentEnv: cleanDeployment, ownerCapitalApprovalActive: true, liveExecutionEnabled: false, metrics: { observationCycles: 25, rejectedOrders: 1, reconciliationMismatches: 0, criticalAlerts: 0, p95LatencyMs: 100 } });
  assert.equal(result.allowed, false);
  assert.ok(result.reasons.includes('readiness_report_not_ready'));
});

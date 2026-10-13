import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  attestStagingBootstrap,
  evaluateDatabaseVerification,
  attestConnectors,
  evaluateSandboxProbe,
  runIncidentDrill,
  evaluatePaperCanary,
  evaluateIndependentReview,
  evaluatePhase6DataHealth,
} from './phase6-operationalization.ts';

test('6.2 staging bootstrap fails closed on unsafe environment', () => {
  const result = attestStagingBootstrap({ environment: 'staging', databaseUrlPresent: true, secretsExternal: false, egressAllowlistVerified: true, liveExecutionEnabled: false });
  assert.equal(result.status, 'blocked');
  assert.ok(result.reasons.includes('secrets_must_be_external'));
});

test('6.3 database verification requires external URL and schema evidence', () => {
  const result = evaluateDatabaseVerification({ databaseUrlPresent: true, migrationIntegrityPass: true, requiredSchemaPass: true, migrationCount: 27 });
  assert.equal(result.status, 'verified');
  assert.equal(result.mode, 'external-postgres');
});

test('6.4 connector attestation fails on missing controls', async () => {
  const result = await attestConnectors([{ id: 'x', dataClass: 'market-data', endpoint: 'https://example.com', allowlistedHost: false, credentialsConfigured: true, readOnly: true, pointInTimeSafe: true, rateLimitConfigured: true, licensingReviewed: true, provenanceReviewed: true, timeoutMs: 1000, maxResponseBytes: 100000 }]);
  assert.equal(result.status, 'blocked');
  assert.ok(result.reasons.some((reason) => reason.includes('connector_endpoint_not_allowlisted')));
});

test('6.5 sandbox runtime probe requires all enforcement controls', () => {
  const result = evaluateSandboxProbe({ contractPass: true, workerBuiltinBlockPass: true, rawKeysDenied: true, networkPolicy: 'deny' });
  assert.equal(result.status, 'verified');
});

test('6.6 incident drill triggers expected observability alarms', () => {
  const result = runIncidentDrill();
  assert.equal(result.status, 'pass');
  assert.equal(result.triggeredAlerts.length, 3);
});

test('6.7 paper canary stays strictly paper-only', () => {
  const result = evaluatePaperCanary({ liveExecutionEnabled: false, readinessGatesHealthy: true, metrics: { observationCycles: 20, rejectedOrders: 0, reconciliationMismatches: 0, criticalAlerts: 0, p95LatencyMs: 100 } });
  assert.equal(result.status, 'ready');
});

test('6.8 independent review requires separation of duties', () => {
  const blocked = evaluateIndependentReview({ implementationHash: 'a', testEvidenceHash: 'b', reviewerId: 'same', implementerId: 'same', conflictsDeclared: true, openCriticalFindings: 0 });
  assert.equal(blocked.status, 'blocked');
  const approved = evaluateIndependentReview({ implementationHash: 'a', testEvidenceHash: 'b', reviewerId: 'reviewer-2', implementerId: 'engineer-1', conflictsDeclared: true, openCriticalFindings: 0 });
  assert.equal(approved.status, 'approved');
});

test('6.x data health wrapper preserves fail-closed quorum semantics', () => {
  const result = evaluatePhase6DataHealth([
    { sourceId: 'a', healthy: true, observedAt: 1_000, latencyMs: 10, quality: 1, errorRate: 0, markets: ['BTC'] },
    { sourceId: 'b', healthy: true, observedAt: 1_000, latencyMs: 10, quality: 1, errorRate: 0, markets: ['BTC'] },
  ], 1_100, { maxAgeMs: 1_000, maxLatencyMs: 100, minQuality: 0.8, maxErrorRate: 0.1, minHealthySources: 2 });
  assert.equal(result.state, 'healthy');
  assert.deepEqual(result.quorumReadyMarkets, ['BTC']);
});

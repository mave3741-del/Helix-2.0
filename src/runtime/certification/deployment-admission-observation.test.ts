import test from 'node:test';
import assert from 'node:assert/strict';
import { createDeploymentAdmissionObservation, InMemoryDeploymentAdmissionObservationStore } from './deployment-admission-observation.ts';
import { createDeploymentReviewBinding, InMemoryDeploymentReviewBindingStore } from './deployment-review-binding.ts';
import { DeploymentAdmissionGate } from './deployment-admission.ts';

const now = 1_770_000_000_000;
const attestation = {
  schemaVersion: 1 as const,
  deploymentId: 'dep-observe',
  issuedAt: now - 1000,
  expiresAt: now + 20_000,
  appVersion: '0.99.11',
  workerIsolationEnforced: true,
  networkEgressEnforced: true,
  secretsIsolationEnforced: true,
  liveExecutionDisabled: true,
};

function binding() {
  return createDeploymentReviewBinding({
    decisionHash: 'c'.repeat(64),
    reviewer: 'external-reviewer',
    implementer: 'helix-implementer',
    decisionAction: 'deploy',
    deploymentId: attestation.deploymentId,
    expectedAppVersion: attestation.appVersion,
    decisionExpiresAt: now + 20_000,
    attestation,
    now,
  });
}

test('9.7 creates deterministic fail-closed observation records', async () => {
  const bindings = new InMemoryDeploymentReviewBindingStore();
  await bindings.append(binding());
  const gate = new DeploymentAdmissionGate(bindings);
  const allowed = await gate.evaluate({ deploymentId: 'dep-observe', appVersion: '0.99.11', attestation, now });
  const observation = createDeploymentAdmissionObservation({ deploymentId: 'dep-observe', appVersion: '0.99.11', attestation, result: allowed, evaluatedAt: now, requestId: 'req-1' });
  assert.equal(observation.allowed, true);
  assert.equal(observation.reasons.length, 0);
  assert.equal(observation.bindingId, binding().bindingId);
  assert.equal(observation.attestationHash.length, 64);
  assert.equal(observation.observationHash.length, 64);
});

test('9.7 records rejection reasons without losing binding context', async () => {
  const bindings = new InMemoryDeploymentReviewBindingStore();
  await bindings.append(binding());
  const gate = new DeploymentAdmissionGate(bindings);
  const rejected = await gate.evaluate({ deploymentId: 'dep-observe', appVersion: '0.99.11', attestation: { ...attestation, liveExecutionDisabled: false }, now });
  const observation = createDeploymentAdmissionObservation({ deploymentId: 'dep-observe', appVersion: '0.99.11', attestation: { ...attestation, liveExecutionDisabled: false }, result: rejected, evaluatedAt: now, requestId: 'req-2' });
  assert.equal(observation.allowed, false);
  assert.deepEqual(observation.reasons, ['deployment_attestation_hash_mismatch', 'live_execution_not_disabled']);
  assert.ok(observation.bindingHash);
});

test('9.7 store is append-only and scoped by deployment', async () => {
  const store = new InMemoryDeploymentAdmissionObservationStore();
  const result = { allowed: false, binding: undefined as never, reasons: ['deployment_review_binding_missing'] };
  const first = createDeploymentAdmissionObservation({ deploymentId: 'dep-a', appVersion: '0.99.11', attestation, result, evaluatedAt: now, requestId: 'req-a' });
  await store.append(first);
  await assert.rejects(() => store.append(first), /duplicate/);
  assert.equal((await store.list('dep-a')).length, 1);
  assert.equal((await store.list('dep-b')).length, 0);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { createDeploymentReviewBinding, hashDeploymentAttestationPayload, InMemoryDeploymentReviewBindingStore } from './deployment-review-binding.ts';

const now = Date.now();
const attestation = {
  schemaVersion: 1 as const,
  deploymentId: 'deploy-20260914-a',
  issuedAt: now - 1_000,
  expiresAt: now + 43_000_000,
  appVersion: '0.99.9',
  workerIsolationEnforced: true,
  networkEgressEnforced: true,
  secretsIsolationEnforced: true,
  liveExecutionDisabled: true,
};
const good = {
  decisionHash: 'a'.repeat(64),
  reviewer: 'reviewer-a',
  implementer: 'builder-b',
  decisionAction: 'deploy' as const,
  deploymentId: attestation.deploymentId,
  expectedAppVersion: attestation.appVersion,
  decisionExpiresAt: now + 43_200_000,
  attestation,
  now,
};

test('deployment review binding binds reviewer decision to attestation identity', () => {
  const binding = createDeploymentReviewBinding(good);
  assert.equal(binding.deploymentId, attestation.deploymentId);
  assert.equal(binding.appVersion, attestation.appVersion);
  assert.equal(binding.attestationHash, hashDeploymentAttestationPayload(attestation));
  assert.match(binding.bindingHash, /^[a-f0-9]{64}$/);
  assert.equal(binding.expiresAt, attestation.expiresAt);
});

test('deployment identity mismatch fails closed', () => {
  assert.throws(() => createDeploymentReviewBinding({ ...good, deploymentId: 'other-deployment' }), /deployment_id_mismatch/);
});

test('application version mismatch fails closed', () => {
  assert.throws(() => createDeploymentReviewBinding({ ...good, expectedAppVersion: '0.99.8' }), /app_version_mismatch/);
});

test('attestation cannot outlive review decision', () => {
  assert.throws(() => createDeploymentReviewBinding({ ...good, decisionExpiresAt: now + 60_000 }), /attestation_outlives_decision/);
});

test('live execution cannot be attested for certification binding', () => {
  assert.throws(() => createDeploymentReviewBinding({ ...good, attestation: { ...attestation, liveExecutionDisabled: false } }), /live_execution_not_disabled/);
});

test('reviewer separation is enforced', () => {
  assert.throws(() => createDeploymentReviewBinding({ ...good, implementer: good.reviewer }), /reviewer_must_differ/);
});

test('binding store is append-only and rejects duplicate binding ids', async () => {
  const store = new InMemoryDeploymentReviewBindingStore();
  const binding = createDeploymentReviewBinding(good);
  await store.append(binding);
  await assert.rejects(() => store.append(binding), /duplicate/);
  assert.equal((await store.list(good.decisionHash)).length, 1);
});

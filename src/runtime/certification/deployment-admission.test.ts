import test from 'node:test';
import assert from 'node:assert/strict';
import { DeploymentAdmissionGate } from './deployment-admission.ts';
import { createDeploymentReviewBinding, hashDeploymentAttestationPayload, InMemoryDeploymentReviewBindingStore } from './deployment-review-binding.ts';

const now = 1_770_000_000_000;
const attestation = {
  schemaVersion: 1 as const,
  deploymentId: 'dep-001',
  issuedAt: now - 1000,
  expiresAt: now + 60_000,
  appVersion: '0.99.9',
  workerIsolationEnforced: true,
  networkEgressEnforced: true,
  secretsIsolationEnforced: true,
  liveExecutionDisabled: true,
};

function makeBinding(action: 'approve' | 'deploy' = 'deploy') {
  return createDeploymentReviewBinding({
    decisionHash: 'a'.repeat(64),
    reviewer: 'external-reviewer',
    implementer: 'helix-implementer',
    decisionAction: action,
    deploymentId: attestation.deploymentId,
    expectedAppVersion: attestation.appVersion,
    decisionExpiresAt: now + 70_000,
    attestation,
    now,
  });
}

test('9.6 admission grants startup only when deployment binding and attestation agree', async () => {
  const store = new InMemoryDeploymentReviewBindingStore();
  const binding = makeBinding();
  await store.append(binding);
  const gate = new DeploymentAdmissionGate(store);
  const result = await gate.evaluate({ deploymentId: 'dep-001', appVersion: '0.99.9', attestation, now });
  assert.equal(result.allowed, true);
  assert.equal(result.binding.bindingId, binding.bindingId);
  assert.equal(result.reasons.length, 0);
  assert.equal(hashDeploymentAttestationPayload(attestation), binding.attestationHash);
});

test('9.6 admission blocks missing binding', async () => {
  const gate = new DeploymentAdmissionGate(new InMemoryDeploymentReviewBindingStore());
  const result = await gate.evaluate({ deploymentId: 'dep-001', appVersion: '0.99.9', attestation, now });
  assert.equal(result.allowed, false);
  assert.deepEqual(result.reasons, ['deployment_review_binding_missing']);
});

test('9.6 admission blocks approval that is not deploy-approved', async () => {
  const store = new InMemoryDeploymentReviewBindingStore();
  await store.append(makeBinding('approve'));
  const result = await new DeploymentAdmissionGate(store).evaluate({ deploymentId: 'dep-001', appVersion: '0.99.9', attestation, now });
  assert.equal(result.allowed, false);
  assert.deepEqual(result.reasons, ['deployment_review_not_deploy_approved']);
});

test('9.6 admission blocks deployment identity and version drift', async () => {
  const store = new InMemoryDeploymentReviewBindingStore();
  await store.append(makeBinding());
  const gate = new DeploymentAdmissionGate(store);
  const wrongDeployment = await gate.evaluate({ deploymentId: 'dep-other', appVersion: '0.99.9', attestation, now });
  assert.equal(wrongDeployment.allowed, false);
  assert.deepEqual(wrongDeployment.reasons, ['deployment_review_binding_missing']);

  const wrongVersion = await gate.evaluate({ deploymentId: 'dep-001', appVersion: '0.99.8', attestation, now });
  assert.equal(wrongVersion.allowed, false);
  assert.deepEqual(wrongVersion.reasons, ['deployment_review_binding_missing']);
});

test('9.6 admission blocks attestation hash drift', async () => {
  const store = new InMemoryDeploymentReviewBindingStore();
  await store.append(makeBinding());
  const gate = new DeploymentAdmissionGate(store);
  const drifted = { ...attestation, networkEgressEnforced: false, issuedAt: attestation.issuedAt };
  const result = await gate.evaluate({ deploymentId: 'dep-001', appVersion: '0.99.9', attestation: drifted, now });
  assert.equal(result.allowed, false);
  assert.deepEqual(result.reasons, ['deployment_attestation_hash_mismatch', 'network_egress_not_attested']);
});

test('9.6 admission blocks expired binding and expired attestation', async () => {
  const expiredBinding = createDeploymentReviewBinding({
    decisionHash: 'b'.repeat(64),
    reviewer: 'external-reviewer',
    implementer: 'helix-implementer',
    decisionAction: 'deploy',
    deploymentId: attestation.deploymentId,
    expectedAppVersion: attestation.appVersion,
    decisionExpiresAt: now + 10_000,
    attestation: { ...attestation, expiresAt: now + 10_000 },
    now,
  });
  const store = new InMemoryDeploymentReviewBindingStore();
  await store.append(expiredBinding);
  const result = await new DeploymentAdmissionGate(store).evaluate({
    deploymentId: 'dep-001',
    appVersion: '0.99.9',
    attestation: { ...attestation, expiresAt: now + 10_000 },
    now: now + 20_000,
  });
  assert.equal(result.allowed, false);
  assert.ok(result.reasons.includes('deployment_review_binding_expired'));
  assert.ok(result.reasons.includes('deployment_attestation_expired'));
});

test('9.6 assertAllowed fails closed', async () => {
  const store = new InMemoryDeploymentReviewBindingStore();
  await store.append(makeBinding());
  const gate = new DeploymentAdmissionGate(store);
  await assert.rejects(
    gate.assertAllowed({ deploymentId: 'dep-001', appVersion: '0.99.9', attestation: { ...attestation, liveExecutionDisabled: false }, now }),
    /deployment_admission_blocked:.*live_execution_not_disabled/,
  );
});

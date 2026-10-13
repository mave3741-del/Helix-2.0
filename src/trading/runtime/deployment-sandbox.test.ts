import assert from 'node:assert/strict';
import { test } from 'node:test';
import { attestDeploymentSandbox, deploymentSandboxPasses } from './deployment-sandbox.ts';

test('deployment sandbox attestation passes only with explicit hardened controls', () => {
  const a = attestDeploymentSandbox({ HELIX_DEPLOYMENT_SANDBOX:'container', HELIX_NETWORK_POLICY:'allowlist', HELIX_FILESYSTEM_POLICY:'isolated', HELIX_RAW_KEYS_DENIED:'true', HELIX_PRIVILEGE_RESTRICTED:'true' });
  assert.equal(deploymentSandboxPasses(a), true);
  assert.equal(a.reasons.length, 0);
});

test('deployment sandbox attestation fails closed when controls are absent', () => {
  const a = attestDeploymentSandbox({});
  assert.equal(deploymentSandboxPasses(a), false);
  assert.ok(a.reasons.length >= 4);
});

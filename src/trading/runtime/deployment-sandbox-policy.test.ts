import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateDeploymentSandbox, assertDeploymentSandboxReady } from './deployment-sandbox-policy.ts';

test('strict deployment sandbox is ready only with all controls attested', () => {
  const env = { HELIX_DEPLOYMENT_SANDBOX:'container', HELIX_NETWORK_POLICY:'allowlist', HELIX_FILESYSTEM_POLICY:'isolated', HELIX_RAW_KEYS_DENIED:'true', HELIX_PRIVILEGE_RESTRICTED:'true' };
  const result = evaluateDeploymentSandbox(env);
  assert.equal(result.ready, true);
  assert.doesNotThrow(() => assertDeploymentSandboxReady(env));
});

test('deployment sandbox fails closed when any hard control is missing', () => {
  const env = { HELIX_DEPLOYMENT_SANDBOX:'container', HELIX_NETWORK_POLICY:'allowlist', HELIX_FILESYSTEM_POLICY:'isolated', HELIX_RAW_KEYS_DENIED:'false', HELIX_PRIVILEGE_RESTRICTED:'true' };
  const result = evaluateDeploymentSandbox(env);
  assert.equal(result.ready, false);
  assert.ok(result.reasons.includes('deployment_raw_key_access_not_denied'));
  assert.throws(() => assertDeploymentSandboxReady(env), /deployment_sandbox_not_ready/);
});

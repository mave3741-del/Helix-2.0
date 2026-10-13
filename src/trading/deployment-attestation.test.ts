import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { verifyDeploymentAttestation } from './deployment-attestation.ts';

function token(privateKey: ReturnType<typeof generateKeyPairSync>['privateKey'], payload: object): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = sign(null, Buffer.from(JSON.stringify(payload)), privateKey).toString('base64url');
  return `${body}.${signature}`;
}

test('deployment attestation verifies an externally signed hardened deployment', () => {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const now = 1_000_000;
  const payload = {
    schemaVersion: 1,
    deploymentId: 'prod-1',
    issuedAt: now - 1_000,
    expiresAt: now + 60_000,
    appVersion: '0.38.0',
    workerIsolationEnforced: true,
    networkEgressEnforced: true,
    secretsIsolationEnforced: true,
    liveExecutionDisabled: true,
  };
  const report = verifyDeploymentAttestation(token(privateKey, payload), publicKey.export({ type:'spki', format:'pem' }).toString(), now);
  assert.equal(report.ok, true);
});

test('deployment attestation fails closed for unsigned or unsafe claims', () => {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const now = 1_000_000;
  const payload = {
    schemaVersion: 1,
    deploymentId: 'prod-2',
    issuedAt: now - 1_000,
    expiresAt: now + 60_000,
    appVersion: '0.38.0',
    workerIsolationEnforced: false,
    networkEgressEnforced: true,
    secretsIsolationEnforced: true,
    liveExecutionDisabled: true,
  };
  const report = verifyDeploymentAttestation(token(privateKey, payload), publicKey.export({ type:'spki', format:'pem' }).toString(), now);
  assert.equal(report.ok, false);
  assert.ok(report.reasons.includes('worker_isolation_not_attested'));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const script = path.resolve('scripts/external-certification.mjs');

test('external certification gate requires explicit external staging mode and database', () => {
  const text = fs.readFileSync(script, 'utf8');
  assert.match(text, /HELIX_EXTERNAL_STAGING=true_required/);
  assert.match(text, /DATABASE_URL_required/);
  assert.match(text, /HELIX_STAGING_CONNECTOR_READY=true_required/);
});

test('external certification gate requires hardened deployment attestations', () => {
  const text = fs.readFileSync(script, 'utf8');
  for (const token of [
    'HELIX_DEPLOYMENT_SANDBOX=container_required',
    'HELIX_FILESYSTEM_POLICY=isolated_required',
    'HELIX_RAW_KEYS_DENIED=true_required',
    'HELIX_PRIVILEGE_RESTRICTED=true_required',
    'HELIX_WORKER_BUILTIN_BLOCKED=true_required',
  ]) assert.match(text, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('external certification report never serializes DATABASE_URL or reviewer/implementer IDs', () => {
  const text = fs.readFileSync(script, 'utf8');
  assert.doesNotMatch(text, /report\.(environment|credentials)\.databaseUrl/);
  assert.doesNotMatch(text, /reviewerId,\s*implementerId/);
  assert.match(text, /reviewerPresent/);
  assert.match(text, /implementerPresent/);
});

test('external certification gate forces live execution off', () => {
  const text = fs.readFileSync(script, 'utf8');
  assert.match(text, /HELIX_LIVE_EXECUTION=true_forbidden/);
  assert.match(text, /liveExecution/);
});


test('external certification requires signed deployment attestation and connector probe', () => {
  const text = fs.readFileSync(script, 'utf8');
  assert.match(text, /HELIX_DEPLOYMENT_ATTESTATION_required/);
  assert.match(text, /HELIX_DEPLOYMENT_ATTESTATION_PUBLIC_KEY_required/);
  assert.match(text, /HELIX_CONNECTOR_PROBE_URL_required/);
  assert.match(text, /deployment-attestation/);
  assert.match(text, /connector-staging-probe/);
});

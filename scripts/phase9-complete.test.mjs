import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
const root = process.cwd();
const script = path.join(root, 'scripts', 'phase9-complete.mjs');

test('phase9 completion gate blocks when prerequisites are absent', () => {
  const env = { ...process.env, HELIX_PHASE9_DRY_RUN: 'true' };
  for (const key of ['HELIX_EXTERNAL_STAGING','DATABASE_URL','HELIX_STAGING_CONNECTOR_READY','HELIX_CONNECTOR_PROBE_URL','HELIX_DEPLOYMENT_SANDBOX','HELIX_NETWORK_POLICY','HELIX_FILESYSTEM_POLICY','HELIX_RAW_KEYS_DENIED','HELIX_PRIVILEGE_RESTRICTED','HELIX_DEPLOYMENT_ATTESTATION','HELIX_DEPLOYMENT_ATTESTATION_PUBLIC_KEY','HELIX_WORKER_BUILTIN_BLOCKED','HELIX_REVIEWER_ID','HELIX_IMPLEMENTER_ID','HELIX_CONFLICTS_DECLARED']) delete env[key];
  assert.throws(() => execFileSync(process.execPath, [script], { cwd: root, env, encoding: 'utf8' }));
  const report = JSON.parse(fs.readFileSync(path.join(root, 'artifacts', 'phase9-completion-evidence.json'), 'utf8'));
  assert.equal(report.status, 'BLOCKED'); assert.equal(report.security.databaseUrlConfigured, false); assert.equal(report.security.secretsPrinted, false);
});

test('phase9 completion gate dry-run enumerates external stages without secrets', () => {
  const env = { ...process.env, HELIX_PHASE9_DRY_RUN: 'true', HELIX_EXTERNAL_STAGING: 'true', DATABASE_URL: 'postgresql://secret-user:secret-password@127.0.0.1:5432/helix_trading', HELIX_STAGING_CONNECTOR_READY: 'true', HELIX_CONNECTOR_PROBE_URL: 'https://example.invalid/probe', HELIX_DEPLOYMENT_SANDBOX: 'container', HELIX_NETWORK_POLICY: 'deny', HELIX_FILESYSTEM_POLICY: 'isolated', HELIX_RAW_KEYS_DENIED: 'true', HELIX_PRIVILEGE_RESTRICTED: 'true', HELIX_DEPLOYMENT_ATTESTATION: 'dummy', HELIX_DEPLOYMENT_ATTESTATION_PUBLIC_KEY: 'dummy-key', HELIX_WORKER_BUILTIN_BLOCKED: 'true', HELIX_REVIEWER_ID: 'reviewer', HELIX_IMPLEMENTER_ID: 'implementer', HELIX_CONFLICTS_DECLARED: 'true', HELIX_LIVE_EXECUTION: 'false' };
  execFileSync(process.execPath, [script], { cwd: root, env, encoding: 'utf8' });
  const output = JSON.parse(fs.readFileSync(path.join(root, 'artifacts', 'phase9-completion-evidence.json'), 'utf8'));
  assert.equal(output.status, 'DRY_RUN');
  assert.deepEqual(output.execution.map((x) => x.name), ['postgres-preflight','postgres-certification','external-certification','evidence-reconciliation']);
  assert.equal(JSON.stringify(output).includes('secret-password'), false);
});

test('phase9 completion gate rejects reviewer/implementer identity collision', () => {
  const env = { ...process.env, HELIX_PHASE9_DRY_RUN: 'true', HELIX_EXTERNAL_STAGING: 'true', DATABASE_URL: 'postgres://x', HELIX_STAGING_CONNECTOR_READY: 'true', HELIX_CONNECTOR_PROBE_URL: 'https://example.invalid', HELIX_DEPLOYMENT_SANDBOX: 'container', HELIX_NETWORK_POLICY: 'deny', HELIX_FILESYSTEM_POLICY: 'isolated', HELIX_RAW_KEYS_DENIED: 'true', HELIX_PRIVILEGE_RESTRICTED: 'true', HELIX_DEPLOYMENT_ATTESTATION: 'dummy', HELIX_DEPLOYMENT_ATTESTATION_PUBLIC_KEY: 'dummy', HELIX_WORKER_BUILTIN_BLOCKED: 'true', HELIX_REVIEWER_ID: 'same', HELIX_IMPLEMENTER_ID: 'same', HELIX_CONFLICTS_DECLARED: 'true' };
  assert.throws(() => execFileSync(process.execPath, [script], { cwd: root, env, encoding: 'utf8' }));
  const output = JSON.parse(fs.readFileSync(path.join(root, 'artifacts', 'phase9-completion-evidence.json'), 'utf8'));
  assert.equal(output.status, 'BLOCKED'); assert.ok(output.prerequisites.reasons.includes('HELIX_REVIEWER_ID_must_differ_from_HELIX_IMPLEMENTER_ID'));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
function generateLedger(envOverrides = {}) {
  const executable = process.platform === 'win32' ? 'node.exe' : 'node';
  execFileSync(executable, ['scripts/certification-run-ledger.mjs'], { cwd: root, stdio: 'ignore', env: { ...process.env, ...envOverrides } });
}
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex');

test('certification ledger hash is deterministic over canonical payload', () => {
  const payload = { schemaVersion: 1, gate: 'phase9-certification-run-ledger', packageVersion: '0.99.12', status: 'PENDING_EXTERNAL_PASS' };
  assert.equal(hash(payload), hash({ ...payload }));
});

test('live execution cannot be represented as a safe pass', () => {
  generateLedger({ HELIX_LIVE_EXECUTION: 'true', HELIX_EXTERNAL_CERTIFICATION_PASS: '' });
  const file = path.join(root, 'artifacts', 'certification-run-ledger.json');
  const record = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(record.liveExecutionDisabled, false, 'ledger must truthfully record that live execution was enabled for this run');
  assert.notEqual(record.status, 'PASS', 'a run with live execution enabled must never carry a PASS status without explicit external certification');
});

test('generated ledger record replays to the recorded hash', () => {
  generateLedger();
  const file = path.join(root, 'artifacts', 'certification-run-ledger.json');
  const record = JSON.parse(fs.readFileSync(file, 'utf8'));
  const { recordHash, ...payload } = record;
  assert.match(recordHash, /^[0-9a-f]{64}$/);
  assert.equal(hash(payload), recordHash);
});

test('pending external certification remains explicit until real PASS evidence exists', () => {
  generateLedger();
  const file = path.join(root, 'artifacts', 'certification-run-ledger.json');
  const record = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(record.status, 'PENDING_EXTERNAL_PASS');
  assert.equal(record.externalCertificationPass, false);
});

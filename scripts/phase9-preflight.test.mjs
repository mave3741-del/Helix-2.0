import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

const root = process.cwd();

test('phase9 preflight fails closed without external credentials', () => {
  const env = { PATH: process.env.PATH, HOME: process.env.HOME };
  const result = spawnSync(process.execPath, ['scripts/external-certification-preflight.mjs'], { cwd: root, env, encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  const report = JSON.parse(fs.readFileSync('artifacts/phase9-external-certification-preflight.json', 'utf8'));
  assert.equal(report.status, 'BLOCKED');
  assert.ok(report.reasons.includes('HELIX_EXTERNAL_STAGING_required_or_invalid'));
  assert.equal(report.redactionPolicy.includes('credentials'), true);
  assert.equal(Object.prototype.hasOwnProperty.call(report, 'DATABASE_URL'), false);
});

test('phase9 preflight source contains no credential-value serialization', () => {
  const source = fs.readFileSync('scripts/external-certification-preflight.mjs', 'utf8');
  assert.match(source, /redactionPolicy/);
  assert.doesNotMatch(source, /console\.log\(process\.env\)/);
  assert.doesNotMatch(source, /DATABASE_URL:\s*process\.env/);
});

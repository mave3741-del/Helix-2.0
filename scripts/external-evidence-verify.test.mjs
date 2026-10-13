import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const verifier = path.resolve('scripts/external-evidence-verify.mjs');
const fixtureDir = path.resolve('scripts/.fixtures');
fs.mkdirSync(fixtureDir, { recursive: true });

function hash(report) {
  return createHash('sha256').update(JSON.stringify({
    gate: report.gate,
    packageVersion: report.packageVersion,
    environment: report.environment,
    prerequisites: report.prerequisites,
    execution: report.execution.map(({ name, status, exitCode, output }) => ({ name, status, exitCode, output })),
  })).digest('hex');
}
function makeReport() {
  const report = {
    schema: 2,
    gate: 'phase8.1-external-certification',
    packageVersion: '0.98.3',
    generatedAt: '2026-09-14T00:00:00.000Z',
    environment: { node: 'v22.16.0', platform: 'linux', reviewerPresent: true, implementerPresent: true, reviewerDiffers: true, liveExecution: false },
    prerequisites: { status: 'READY', reasons: [] },
    execution: [{ name: 'release:integrity', status: 'PASS', exitCode: 0, output: 'ok' }],
  };
  report.status = 'PASS';
  report.evidenceHash = hash(report);
  return report;
}
function run(file) {
  return execFileSync(process.execPath, [verifier, `--input=${file}`], { cwd: root, encoding: 'utf8' });
}

test('verifier accepts an untampered certification evidence report', () => {
  const file = path.join(fixtureDir, 'external-evidence-valid.json');
  fs.writeFileSync(file, JSON.stringify(makeReport(), null, 2));
  const result = JSON.parse(run(file));
  assert.equal(result.status, 'PASS');
  assert.equal(result.replaySafe, true);
  assert.equal(result.checks.evidenceHashMatches, true);
});

test('verifier rejects tampered execution output', () => {
  const file = path.join(fixtureDir, 'external-evidence-tampered.json');
  const report = makeReport();
  report.execution[0].output = 'tampered';
  fs.writeFileSync(file, JSON.stringify(report, null, 2));
  assert.throws(() => run(file));
});

test('verifier rejects raw credential-shaped keys', () => {
  const file = path.join(fixtureDir, 'external-evidence-secret.json');
  const report = makeReport();
  report.environment.DATABASE_URL = 'postgres://secret';
  report.evidenceHash = hash(report);
  fs.writeFileSync(file, JSON.stringify(report, null, 2));
  assert.throws(() => run(file));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const script = path.resolve('scripts/verify-sealed-bundle.mjs');
const temp = path.resolve('scripts/.fixtures/sealed-bundle-test');
const evidence = {
  schema: 2,
  gate: 'phase8.1-external-certification',
  packageVersion: '0.99.6',
  environment: { node: 'v22.16.0', platform: 'linux', liveExecution: false },
  prerequisites: { status: 'READY', reasons: [] },
  execution: [{ name: 'release:integrity', status: 'PASS', exitCode: 0, output: 'ok' }],
  status: 'PASS',
};
function evidenceHash(report) {
  return createHash('sha256').update(JSON.stringify({
    gate: report.gate,
    packageVersion: report.packageVersion,
    environment: report.environment,
    prerequisites: report.prerequisites,
    execution: report.execution.map(({ name, status, exitCode, output }) => ({ name, status, exitCode, output })),
  })).digest('hex');
}
function setup() {
  fs.rmSync(temp, { recursive: true, force: true });
  fs.mkdirSync(temp, { recursive: true });
  const report = { ...evidence, evidenceHash: evidenceHash(evidence) };
  const evidenceBytes = Buffer.from(`${JSON.stringify(report, null, 2)}\n`);
  const evidenceName = 'external-certification-evidence.json';
  fs.writeFileSync(path.join(temp, evidenceName), evidenceBytes);
  const files = [{ path: evidenceName, bytes: evidenceBytes.length, sha256: createHash('sha256').update(evidenceBytes).digest('hex') }];
  const manifestBase = {
    schema: 1,
    gate: 'phase9-external-certification-sealed-bundle',
    packageVersion: '0.99.6',
    certificationStatus: 'PASS',
    preflightStatus: 'READY',
    evidenceHash: report.evidenceHash,
    files,
    safety: { liveExecutionDisabled: true, credentialsSerialized: false, reviewerIdentitySerialized: false, databaseConnectionStringSerialized: false },
    lockfile: { lockfileVersion: 3, rootVersion: '0.99.6' },
  };
  const bundleHash = createHash('sha256').update(JSON.stringify(manifestBase)).digest('hex');
  const manifest = { ...manifestBase, bundleHash };
  fs.writeFileSync(path.join(temp, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  fs.writeFileSync(path.join(temp, 'SEALED.flag'), `${bundleHash}\n`);
}
function run(bundle = temp) {
  return execFileSync(process.execPath, [script, `--bundle=${bundle}`], { cwd: root, encoding: 'utf8' });
}

test('sealed bundle replay verifier accepts an untampered bundle', () => {
  setup();
  const result = JSON.parse(run());
  assert.equal(result.status, 'PASS');
  assert.equal(result.replaySafe, true);
  assert.equal(result.checks.bundleHashMatches, true);
  assert.equal(result.checks.evidenceReplayPass, true);
});

test('sealed bundle replay verifier rejects changed artifact bytes', () => {
  setup();
  fs.appendFileSync(path.join(temp, 'external-certification-evidence.json'), 'tampered\n');
  assert.throws(() => run());
});

test('sealed bundle replay verifier rejects a mismatched SEALED flag', () => {
  setup();
  fs.writeFileSync(path.join(temp, 'SEALED.flag'), '0'.repeat(64) + '\n');
  assert.throws(() => run());
});

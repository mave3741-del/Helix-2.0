import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const artifacts = path.join(root, 'artifacts');
const script = path.join(root, 'scripts', 'certification-evidence-reconcile.mjs');

async function clean() {
  await mkdir(artifacts, { recursive: true });
  for (const name of ['certification-evidence-reconciliation.json','postgres-certification-evidence.json','external-certification-evidence.json','connector-staging-probe.json','deployment-attestation-verification.json','certification-run-ledger.json']) {
    await rm(path.join(artifacts, name), { force: true });
  }
}
function run() {
  try { return execFileSync(process.execPath, [script], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); }
  catch (error) { return String(error?.stdout ?? ''); }
}

 test('reconciliation fails closed when evidence is absent', async () => {
  await clean();
  const report = JSON.parse(run());
  assert.equal(report.status, 'BLOCKED');
  assert.ok(report.reasons.includes('postgres_certification_evidence_missing_or_invalid'));
  assert.ok(report.reasons.includes('external_certification_evidence_missing_or_invalid'));
});

test('reconciliation passes only when all required artifacts agree', async () => {
  await clean();
  const pkg = JSON.parse(await import('node:fs/promises').then((m) => m.readFile(path.join(root, 'package.json'), 'utf8')));
  const base = { packageVersion: pkg.version };
  await writeFile(path.join(artifacts, 'postgres-certification-evidence.json'), JSON.stringify({ ...base, status: 'PASS' }));
  await writeFile(path.join(artifacts, 'external-certification-evidence.json'), JSON.stringify({ ...base, status: 'PASS' }));
  await writeFile(path.join(artifacts, 'connector-staging-probe.json'), JSON.stringify({ status: 'PASS' }));
  await writeFile(path.join(artifacts, 'deployment-attestation-verification.json'), JSON.stringify({ status: 'PASS' }));
  await writeFile(path.join(artifacts, 'certification-run-ledger.json'), JSON.stringify({ packageVersion: pkg.version, liveExecutionDisabled: true }));
  const report = JSON.parse(run());
  assert.equal(report.status, 'PASS');
  assert.deepEqual(report.reasons, []);
  for (const name of ['postgres', 'external', 'connector', 'attestation', 'ledger']) assert.equal(report.checks[name].ok, true);
  for (const file of ['postgres-certification-evidence.json','external-certification-evidence.json','connector-staging-probe.json','deployment-attestation-verification.json','certification-run-ledger.json']) await rm(path.join(artifacts, file), { force: true });
});

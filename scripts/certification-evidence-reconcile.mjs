#!/usr/bin/env node
/**
 * Fail-closed reconciliation of independent certification artifacts.
 * PASS is possible only when every required evidence artifact is present,
 * internally PASS, live execution is disabled, and the package version matches.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const root = process.cwd();
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const artifactDir = path.join(root, 'artifacts');

function hashJson(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
function load(name) {
  const file = path.join(artifactDir, name);
  if (!fs.existsSync(file)) return { file, present: false, value: null };
  try { return { file, present: true, value: JSON.parse(fs.readFileSync(file, 'utf8')) }; }
  catch { return { file, present: true, value: null, parseError: true }; }
}
function validatePostgres(x) {
  if (!x.present || !x.value) return { ok: false, reason: 'postgres_certification_evidence_missing_or_invalid' };
  if (x.value.status !== 'PASS') return { ok: false, reason: `postgres_certification_status_${String(x.value.status).toLowerCase()}` };
  if (x.value.packageVersion !== pkg.version) return { ok: false, reason: 'postgres_package_version_mismatch' };
  return { ok: true };
}
function validateExternal(x) {
  if (!x.present || !x.value) return { ok: false, reason: 'external_certification_evidence_missing_or_invalid' };
  if (x.value.status !== 'PASS') return { ok: false, reason: `external_certification_status_${String(x.value.status).toLowerCase()}` };
  if (x.value.packageVersion !== pkg.version) return { ok: false, reason: 'external_package_version_mismatch' };
  return { ok: true };
}
function validateConnector(x) {
  if (!x.present || !x.value) return { ok: false, reason: 'connector_probe_evidence_missing_or_invalid' };
  if (x.value.status !== 'PASS') return { ok: false, reason: `connector_probe_status_${String(x.value.status).toLowerCase()}` };
  return { ok: true };
}
function validateAttestation(x) {
  if (!x.present || !x.value) return { ok: false, reason: 'deployment_attestation_verification_missing_or_invalid' };
  if (x.value.status !== 'PASS') return { ok: false, reason: `deployment_attestation_status_${String(x.value.status).toLowerCase()}` };
  return { ok: true };
}
function validateLedger(x) {
  if (!x.present || !x.value) return { ok: false, reason: 'certification_run_ledger_missing_or_invalid' };
  if (x.value.packageVersion !== pkg.version) return { ok: false, reason: 'ledger_package_version_mismatch' };
  if (x.value.liveExecutionDisabled !== true) return { ok: false, reason: 'ledger_live_execution_not_disabled' };
  return { ok: true };
}

const artifacts = {
  postgres: load('postgres-certification-evidence.json'),
  external: load('external-certification-evidence.json'),
  connector: load('connector-staging-probe.json'),
  attestation: load('deployment-attestation-verification.json'),
  ledger: load('certification-run-ledger.json'),
};

const checks = {
  postgres: validatePostgres(artifacts.postgres),
  external: validateExternal(artifacts.external),
  connector: validateConnector(artifacts.connector),
  attestation: validateAttestation(artifacts.attestation),
  ledger: validateLedger(artifacts.ledger),
};
const reasons = Object.values(checks).filter((x) => !x.ok).map((x) => x.reason);
if (process.env.HELIX_LIVE_EXECUTION === 'true') reasons.push('live_execution_enabled');

const report = {
  schema: 1,
  gate: 'phase9.11-certification-evidence-reconciliation',
  packageVersion: pkg.version,
  generatedAt: new Date().toISOString(),
  status: reasons.length ? 'BLOCKED' : 'PASS',
  reasons: [...new Set(reasons)].sort(),
  checks,
  artifactPresence: Object.fromEntries(Object.entries(artifacts).map(([key, item]) => [key, item.present])),
};
report.evidenceHash = hashJson({
  gate: report.gate,
  packageVersion: report.packageVersion,
  status: report.status,
  reasons: report.reasons,
  checks: report.checks,
  artifactPresence: report.artifactPresence,
});
fs.mkdirSync(artifactDir, { recursive: true });
fs.writeFileSync(path.join(artifactDir, 'certification-evidence-reconciliation.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
process.exitCode = report.status === 'PASS' ? 0 : 1;

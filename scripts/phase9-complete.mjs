#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const root = process.cwd();
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const required = [
  ['HELIX_EXTERNAL_STAGING', 'true'], ['DATABASE_URL', 'non-empty'],
  ['HELIX_STAGING_CONNECTOR_READY', 'true'], ['HELIX_CONNECTOR_PROBE_URL', 'non-empty'],
  ['HELIX_DEPLOYMENT_SANDBOX', 'container'], ['HELIX_NETWORK_POLICY', 'deny|allowlist'],
  ['HELIX_FILESYSTEM_POLICY', 'isolated'], ['HELIX_RAW_KEYS_DENIED', 'true'],
  ['HELIX_PRIVILEGE_RESTRICTED', 'true'], ['HELIX_DEPLOYMENT_ATTESTATION', 'non-empty'],
  ['HELIX_DEPLOYMENT_ATTESTATION_PUBLIC_KEY', 'non-empty'], ['HELIX_WORKER_BUILTIN_BLOCKED', 'true'],
  ['HELIX_REVIEWER_ID', 'non-empty'], ['HELIX_IMPLEMENTER_ID', 'non-empty'],
  ['HELIX_CONFLICTS_DECLARED', 'true'],
];
const valueMatches = (name, rule) => {
  const value = process.env[name]?.trim() ?? '';
  if (rule === 'non-empty') return Boolean(value);
  if (rule === 'deny|allowlist') return value === 'deny' || value === 'allowlist';
  return value === rule;
};
const missing = required.filter(([name, rule]) => !valueMatches(name, rule)).map(([name, rule]) => `${name}:${rule}`);
const reviewer = process.env.HELIX_REVIEWER_ID?.trim() ?? '';
const implementer = process.env.HELIX_IMPLEMENTER_ID?.trim() ?? '';
if (reviewer && implementer && reviewer === implementer) missing.push('HELIX_REVIEWER_ID_must_differ_from_HELIX_IMPLEMENTER_ID');
if (process.env.HELIX_LIVE_EXECUTION === 'true') missing.push('HELIX_LIVE_EXECUTION_must_not_be_true');
const commands = [
  ['postgres-preflight', 'npm', ['run', 'phase9.9:postgres-preflight']],
  ['postgres-certification', 'npm', ['run', 'phase9.10:postgres']],
  ['external-certification', 'npm', ['run', 'external:certify']],
  ['evidence-reconciliation', 'npm', ['run', 'phase9.11:reconcile']],
];
const report = {
  schema: 1, gate: 'phase9-completion-operator-gate', packageVersion: pkg.version,
  generatedAt: new Date().toISOString(),
  prerequisites: { status: missing.length ? 'BLOCKED' : 'READY', reasons: [...new Set(missing)].sort() },
  security: { databaseUrlConfigured: Boolean(process.env.DATABASE_URL?.trim()), secretsPrinted: false, liveExecutionEnabled: process.env.HELIX_LIVE_EXECUTION === 'true' },
  execution: [],
};
const dryRun = process.env.HELIX_PHASE9_DRY_RUN === 'true';
if (report.prerequisites.status === 'READY') {
  for (const [name, executable, args] of commands) {
    if (dryRun) { report.execution.push({ name, status: 'DRY_RUN', command: `${executable} ${args.join(' ')}` }); continue; }
    const actual = process.platform === 'win32' && executable === 'npm' ? 'npm.cmd' : executable;
    try {
      const output = execFileSync(actual, args, { cwd: root, env: process.env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 20 * 1024 * 1024 });
      report.execution.push({ name, status: 'PASS', output: String(output).trim().slice(-4000) });
    } catch (error) {
      report.execution.push({ name, status: 'FAIL', exitCode: typeof error?.status === 'number' ? error.status : 1, output: `${String(error?.stdout ?? '').trim()}\n${String(error?.stderr ?? '').trim()}`.trim().slice(-4000) });
      break;
    }
  }
}
const failed = report.execution.some((step) => step.status === 'FAIL');
report.status = report.prerequisites.status === 'BLOCKED' ? 'BLOCKED' : failed ? 'FAIL' : dryRun ? 'DRY_RUN' : 'PASS';
report.evidenceHash = createHash('sha256').update(JSON.stringify({ gate: report.gate, packageVersion: report.packageVersion, prerequisites: report.prerequisites, security: report.security, execution: report.execution.map(({ name, status, exitCode, command }) => ({ name, status, exitCode, command })) })).digest('hex');
const artifactDir = path.join(root, 'artifacts');
fs.mkdirSync(artifactDir, { recursive: true });
fs.writeFileSync(path.join(artifactDir, 'phase9-completion-evidence.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
process.exitCode = ['PASS', 'DRY_RUN'].includes(report.status) ? 0 : 1;

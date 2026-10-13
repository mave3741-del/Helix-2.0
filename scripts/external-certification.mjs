#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const root = process.cwd();
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
const requiredFiles = [
  '.github/workflows/ci.yml',
  'scripts/ci-environment-verify.mjs',
  'scripts/migrate.mjs',
  'scripts/db-verify.mjs',
  'scripts/db-immutability-verify.mjs',
  'scripts/phase6-operationalization.mjs',
  'scripts/verify-deployment-sandbox.mjs',
  'scripts/release-integrity.mjs',
];

function has(name) { return fs.existsSync(path.join(root, name)); }
function run(command, args, env = process.env) {
  const executable = process.platform === 'win32' && command === 'npm' ? 'npm.cmd' : command;
  try {
    const output = execFileSync(executable, args, {
      cwd: root,
      env,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 10 * 1024 * 1024,
    });
    return { status: 'PASS', output: output.trim().slice(-4000) };
  } catch (error) {
    const stdout = String(error?.stdout ?? '').trim();
    const stderr = String(error?.stderr ?? '').trim();
    return {
      status: 'FAIL',
      exitCode: typeof error?.status === 'number' ? error.status : 1,
      output: `${stdout}\n${stderr}`.trim().slice(-4000),
    };
  }
}

function sha256(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

const reasons = [];
const externalStaging = process.env.HELIX_EXTERNAL_STAGING === 'true';
const liveExecution = process.env.HELIX_LIVE_EXECUTION === 'true';
const databaseUrlPresent = Boolean(process.env.DATABASE_URL?.trim());
const reviewerId = process.env.HELIX_REVIEWER_ID?.trim() ?? '';
const implementerId = process.env.HELIX_IMPLEMENTER_ID?.trim() ?? '';

if (!externalStaging) reasons.push('HELIX_EXTERNAL_STAGING=true_required');
if (!databaseUrlPresent) reasons.push('DATABASE_URL_required');
if (process.env.HELIX_STAGING_CONNECTOR_READY !== 'true') reasons.push('HELIX_STAGING_CONNECTOR_READY=true_required');
if (!process.env.HELIX_CONNECTOR_PROBE_URL?.trim()) reasons.push('HELIX_CONNECTOR_PROBE_URL_required');
if (process.env.HELIX_DEPLOYMENT_SANDBOX !== 'container') reasons.push('HELIX_DEPLOYMENT_SANDBOX=container_required');
if (!['deny', 'allowlist'].includes(process.env.HELIX_NETWORK_POLICY ?? '')) reasons.push('restricted_network_policy_required');
if (process.env.HELIX_FILESYSTEM_POLICY !== 'isolated') reasons.push('HELIX_FILESYSTEM_POLICY=isolated_required');
if (process.env.HELIX_RAW_KEYS_DENIED !== 'true') reasons.push('HELIX_RAW_KEYS_DENIED=true_required');
if (process.env.HELIX_PRIVILEGE_RESTRICTED !== 'true') reasons.push('HELIX_PRIVILEGE_RESTRICTED=true_required');
if (!process.env.HELIX_DEPLOYMENT_ATTESTATION?.trim()) reasons.push('HELIX_DEPLOYMENT_ATTESTATION_required');
if (!process.env.HELIX_DEPLOYMENT_ATTESTATION_PUBLIC_KEY?.trim()) reasons.push('HELIX_DEPLOYMENT_ATTESTATION_PUBLIC_KEY_required');
if (process.env.HELIX_WORKER_BUILTIN_BLOCKED !== 'true') reasons.push('HELIX_WORKER_BUILTIN_BLOCKED=true_required');
if (!reviewerId) reasons.push('HELIX_REVIEWER_ID_required');
if (!implementerId) reasons.push('HELIX_IMPLEMENTER_ID_required');
if (reviewerId && implementerId && reviewerId === implementerId) reasons.push('reviewer_must_differ_from_implementer');
if (process.env.HELIX_CONFLICTS_DECLARED !== 'true') reasons.push('HELIX_CONFLICTS_DECLARED=true_required');
if (liveExecution) reasons.push('HELIX_LIVE_EXECUTION=true_forbidden');
if (lock.lockfileVersion !== 3) reasons.push('lockfileVersion_3_required');
if (lock.packages?.['']?.version !== pkg.version) reasons.push('package_lock_version_mismatch');
for (const file of requiredFiles) if (!has(file)) reasons.push(`required_file_missing:${file}`);

const report = {
  schema: 2,
  gate: 'phase8.1-external-certification',
  packageVersion: pkg.version,
  generatedAt: new Date().toISOString(),
  environment: {
    node: process.version,
    platform: process.platform,
    externalStaging,
    databaseUrlPresent,
    connectorReady: process.env.HELIX_STAGING_CONNECTOR_READY === 'true',
    deploymentSandbox: process.env.HELIX_DEPLOYMENT_SANDBOX ?? 'missing',
    networkPolicy: process.env.HELIX_NETWORK_POLICY ?? 'missing',
    filesystemPolicy: process.env.HELIX_FILESYSTEM_POLICY ?? 'missing',
    rawKeysDenied: process.env.HELIX_RAW_KEYS_DENIED === 'true',
    privilegeRestricted: process.env.HELIX_PRIVILEGE_RESTRICTED === 'true',
    workerBuiltinBlocked: process.env.HELIX_WORKER_BUILTIN_BLOCKED === 'true',
    liveExecution: liveExecution,
    reviewerPresent: Boolean(reviewerId),
    implementerPresent: Boolean(implementerId),
    reviewerDiffers: Boolean(reviewerId && implementerId && reviewerId !== implementerId),
    conflictsDeclared: process.env.HELIX_CONFLICTS_DECLARED === 'true',
    deploymentAttestationConfigured: Boolean(process.env.HELIX_DEPLOYMENT_ATTESTATION?.trim()),
    connectorProbeConfigured: Boolean(process.env.HELIX_CONNECTOR_PROBE_URL?.trim()),
  },
  prerequisites: {
    status: reasons.length ? 'BLOCKED' : 'READY',
    reasons: [...new Set(reasons)].sort(),
  },
  execution: [],
};

if (reasons.length === 0) {
  const commands = [
    ['ci:environment', ['run', 'ci:environment']],
    ['release:integrity', ['run', 'release:integrity']],
    ['migration:integrity', ['run', 'migration:integrity']],
    ['test:coverage-integrity', ['run', 'test:coverage-integrity']],
    ['phase6:certify', ['run', 'phase6:certify']],
    ['phase7:preflight', ['run', 'phase7:preflight']],
    ['ci:certify', ['run', 'ci:certify']],
    ['db:migrate', ['run', 'db:migrate']],
    ['db:verify', ['run', 'db:verify']],
    ['db-immutability', ['node', 'scripts/db-immutability-verify.mjs']],
    ['sandbox-contract', ['node', 'scripts/verify-deployment-sandbox.mjs']],
    ['deployment-attestation', ['node', 'scripts/verify-deployment-attestation.mjs']],
    ['connector-staging-probe', ['node', 'scripts/connector-staging-probe.mjs']],
  ];
  for (const [name, args] of commands) {
    const result = run('npm', args, process.env);
    report.execution.push({ name, ...result });
    if (result.status === 'FAIL') break;
  }
}

const failedStep = report.execution.find((step) => step.status === 'FAIL');
report.status = report.prerequisites.status === 'BLOCKED'
  ? 'BLOCKED'
  : failedStep
    ? 'FAIL'
    : 'PASS';
report.evidenceHash = sha256({
  gate: report.gate,
  packageVersion: report.packageVersion,
  environment: report.environment,
  prerequisites: report.prerequisites,
  execution: report.execution.map(({ name, status, exitCode, output }) => ({ name, status, exitCode, output })),
});

const artifactDir = path.join(root, 'artifacts');
fs.mkdirSync(artifactDir, { recursive: true });
fs.writeFileSync(path.join(artifactDir, 'external-certification-evidence.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
process.exitCode = report.status === 'PASS' ? 0 : 1;

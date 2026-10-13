#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
const reasons = [];
const checks = [];

function add(name, status, detail = undefined) {
  checks.push({ name, status, ...(detail ? { detail } : {}) });
}
function requireEnv(name, predicate = value => Boolean(value?.trim())) {
  const value = process.env[name];
  const ok = predicate(value);
  add(`env:${name}`, ok ? 'PASS' : 'BLOCKED');
  if (!ok) reasons.push(`${name}_required_or_invalid`);
  return ok;
}

function npmVersion() {
  const executable = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  try { return execFileSync(executable, ['--version'], { cwd: root, encoding: 'utf8' }).trim(); }
  catch { return ''; }
}

const nodeOk = /^v22\./.test(process.version);
add('runtime:node22', nodeOk, process.version);
if (!nodeOk) reasons.push('node22_required');

const npm = npmVersion();
const npmOk = /^10\./.test(npm);
add('runtime:npm10', npmOk, npm || 'unavailable');
if (!npmOk) reasons.push('npm10_required');

const lockOk = lock.lockfileVersion === 3 && lock.packages?.['']?.version === pkg.version;
add('package-lock:aligned', lockOk, `lockfileVersion=${lock.lockfileVersion};rootVersion=${lock.packages?.['']?.version ?? 'missing'};packageVersion=${pkg.version}`);
if (!lockOk) reasons.push('package_lock_alignment_invalid');

for (const file of [
  '.github/workflows/ci.yml',
  'scripts/external-certification.mjs',
  'scripts/external-evidence-verify.mjs',
  'scripts/connector-staging-probe.mjs',
  'scripts/verify-deployment-attestation.mjs',
  'scripts/db-verify.mjs',
  'scripts/db-immutability-verify.mjs',
  'scripts/verify-deployment-sandbox.mjs',
]) {
  const ok = fs.existsSync(path.join(root, file));
  add(`file:${file}`, ok);
  if (!ok) reasons.push(`required_file_missing:${file}`);
}

const directDeps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
const missingDeps = [];
for (const name of Object.keys(directDeps).sort()) {
  const packageJson = path.join(root, 'node_modules', name, 'package.json');
  if (!fs.existsSync(packageJson)) missingDeps.push(name);
}
add('dependencies:hydrated', missingDeps.length === 0, missingDeps.length ? `missing=${missingDeps.length}` : `${Object.keys(directDeps).length} direct dependencies installed`);
if (missingDeps.length) reasons.push('dependency_hydration_missing');

requireEnv('HELIX_EXTERNAL_STAGING', value => value === 'true');
requireEnv('DATABASE_URL');
requireEnv('HELIX_STAGING_CONNECTOR_READY', value => value === 'true');
requireEnv('HELIX_CONNECTOR_PROBE_URL');
requireEnv('HELIX_CONNECTOR_PROBE_ALLOWLISTED', value => value === 'true');
requireEnv('HELIX_DEPLOYMENT_SANDBOX', value => value === 'container');
requireEnv('HELIX_NETWORK_POLICY', value => value === 'deny' || value === 'allowlist');
requireEnv('HELIX_FILESYSTEM_POLICY', value => value === 'isolated');
requireEnv('HELIX_RAW_KEYS_DENIED', value => value === 'true');
requireEnv('HELIX_PRIVILEGE_RESTRICTED', value => value === 'true');
requireEnv('HELIX_WORKER_BUILTIN_BLOCKED', value => value === 'true');
requireEnv('HELIX_DEPLOYMENT_ATTESTATION');
requireEnv('HELIX_DEPLOYMENT_ATTESTATION_PUBLIC_KEY');
requireEnv('HELIX_REVIEWER_ID');
requireEnv('HELIX_IMPLEMENTER_ID');
requireEnv('HELIX_CONFLICTS_DECLARED', value => value === 'true');

const reviewer = process.env.HELIX_REVIEWER_ID?.trim() ?? '';
const implementer = process.env.HELIX_IMPLEMENTER_ID?.trim() ?? '';
const distinct = Boolean(reviewer && implementer && reviewer !== implementer);
add('reviewer:distinct-from-implementer', distinct);
if (!distinct) reasons.push('reviewer_must_differ_from_implementer');

const liveDisabled = process.env.HELIX_LIVE_EXECUTION !== 'true';
add('safety:live-execution-disabled', liveDisabled);
if (!liveDisabled) reasons.push('live_execution_forbidden');

let endpointSafe = true;
const endpoint = process.env.HELIX_CONNECTOR_PROBE_URL?.trim();
if (endpoint) {
  try {
    const u = new URL(endpoint);
    endpointSafe = ['http:', 'https:'].includes(u.protocol) && !u.username && !u.password;
    const host = u.hostname.toLowerCase().replace(/[[\]]/g, '');
    const privateHost = host === 'localhost' || host.endsWith('.localhost') || host === '0.0.0.0' || host === '::1'
      || /^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host)
      || (() => { const m = host.match(/^172\.(\d{1,3})\./); return !!m && Number(m[1]) >= 16 && Number(m[1]) <= 31; })()
      || host.endsWith('.local') || host.endsWith('.internal') || host.endsWith('.lan');
    endpointSafe &&= !privateHost;
  } catch { endpointSafe = false; }
}
add('connector:endpoint-public-and-credential-free', endpointSafe);
if (!endpointSafe) reasons.push('connector_probe_endpoint_invalid');

const report = {
  schema: 1,
  gate: 'phase9-external-certification-preflight',
  packageVersion: pkg.version,
  generatedAt: new Date().toISOString(),
  status: reasons.length ? 'BLOCKED' : 'READY',
  reasons: [...new Set(reasons)].sort(),
  checks,
  redactionPolicy: 'boolean/status metadata only; credentials, tokens, keys, URLs, and database connection strings are never serialized',
};

fs.mkdirSync(path.join(root, 'artifacts'), { recursive: true });
fs.writeFileSync(path.join(root, 'artifacts', 'phase9-external-certification-preflight.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
process.exitCode = report.status === 'READY' ? 0 : 1;

#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const artifactDir = path.join(root, 'artifacts');
const evidencePath = path.join(artifactDir, 'external-certification-evidence.json');
const preflightPath = path.join(artifactDir, 'phase9-external-certification-preflight.json');
const bundleDir = path.join(artifactDir, 'external-certification-bundle');
const verifier = path.join(root, 'scripts', 'external-evidence-verify.mjs');
const forbiddenKeys = new Set([
  'DATABASE_URL', 'databaseUrl', 'reviewerId', 'implementerId', 'password', 'token',
  'secret', 'apiKey', 'privateKey', 'accessToken', 'refreshToken', 'authorization',
]);

function sha256Bytes(buffer) { return createHash('sha256').update(buffer).digest('hex'); }
function sha256Json(value) { return sha256Bytes(Buffer.from(JSON.stringify(value))); }
function hasForbiddenKey(value, seen = new Set()) {
  if (!value || typeof value !== 'object') return false;
  if (seen.has(value)) return false;
  seen.add(value);
  if (Array.isArray(value)) return value.some((item) => hasForbiddenKey(item, seen));
  return Object.entries(value).some(([key, nested]) => forbiddenKeys.has(key) || hasForbiddenKey(nested, seen));
}
function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function safeRelative(file) { return path.relative(root, file).replaceAll(path.sep, '/'); }
function assertFile(file, label) {
  if (!fs.existsSync(file)) throw new Error(`${label}_missing`);
}

assertFile(evidencePath, 'external_certification_evidence');
assertFile(preflightPath, 'phase9_external_certification_preflight');
assertFile(verifier, 'external_evidence_verifier');

const evidence = readJson(evidencePath);
const preflight = readJson(preflightPath);
if (evidence.status !== 'PASS') throw new Error(`external_certification_status_${String(evidence.status ?? 'missing').toLowerCase()}`);
if (preflight.status !== 'READY') throw new Error(`external_certification_preflight_${String(preflight.status ?? 'missing').toLowerCase()}`);
if (hasForbiddenKey(evidence) || hasForbiddenKey(preflight)) throw new Error('forbidden_credential_key_in_evidence');

const verify = spawnSync(process.execPath, [verifier], { cwd: root, encoding: 'utf8' });
if (verify.status !== 0) throw new Error(`external_evidence_verifier_failed:${(verify.stderr || verify.stdout || '').trim().slice(-500)}`);

fs.rmSync(bundleDir, { recursive: true, force: true });
fs.mkdirSync(bundleDir, { recursive: true });
const selected = [
  evidencePath,
  preflightPath,
  path.join(artifactDir, 'dependency-integrity.json'),
  path.join(artifactDir, 'phase8-engineering-gate.json'),
];
const files = [];
for (const source of selected) {
  if (!fs.existsSync(source)) continue;
  const parsed = source.endsWith('.json') ? readJson(source) : null;
  if (parsed && hasForbiddenKey(parsed)) throw new Error(`forbidden_credential_key_in:${safeRelative(source)}`);
  const target = path.join(bundleDir, path.basename(source));
  fs.copyFileSync(source, target);
  const bytes = fs.readFileSync(target);
  files.push({ path: path.basename(target), bytes: bytes.length, sha256: sha256Bytes(bytes) });
}

const packageJson = readJson(path.join(root, 'package.json'));
const lockJson = readJson(path.join(root, 'package-lock.json'));
const manifest = {
  schema: 1,
  gate: 'phase9-external-certification-sealed-bundle',
  packageVersion: packageJson.version,
  generatedAt: new Date().toISOString(),
  certificationStatus: evidence.status,
  preflightStatus: preflight.status,
  evidenceHash: evidence.evidenceHash,
  files: files.sort((a, b) => a.path.localeCompare(b.path)),
  safety: {
    liveExecutionDisabled: evidence.environment?.liveExecution === false,
    credentialsSerialized: false,
    reviewerIdentitySerialized: false,
    databaseConnectionStringSerialized: false,
  },
  lockfile: {
    lockfileVersion: lockJson.lockfileVersion,
    rootVersion: lockJson.packages?.['']?.version,
  },
};
manifest.bundleHash = sha256Json({
  schema: manifest.schema,
  gate: manifest.gate,
  packageVersion: manifest.packageVersion,
  certificationStatus: manifest.certificationStatus,
  preflightStatus: manifest.preflightStatus,
  evidenceHash: manifest.evidenceHash,
  files: manifest.files,
  safety: manifest.safety,
  lockfile: manifest.lockfile,
});

fs.writeFileSync(path.join(bundleDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
fs.writeFileSync(path.join(bundleDir, 'SEALED.flag'), `${manifest.bundleHash}\n`);
fs.writeFileSync(path.join(artifactDir, 'external-certification-bundle.json'), `${JSON.stringify({ ...manifest, bundlePath: safeRelative(bundleDir) }, null, 2)}\n`);
console.log(JSON.stringify({ status: 'PASS', bundle: safeRelative(bundleDir), bundleHash: manifest.bundleHash, files: manifest.files }, null, 2));

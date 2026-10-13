#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const arg = process.argv.slice(2).find((value) => value.startsWith('--bundle='));
const bundleDir = path.resolve(root, arg ? arg.slice('--bundle='.length) : path.join('artifacts', 'external-certification-bundle'));
const verifier = path.join(root, 'scripts', 'external-evidence-verify.mjs');
const forbiddenKeys = new Set([
  'DATABASE_URL', 'databaseUrl', 'reviewerId', 'implementerId', 'password', 'token',
  'secret', 'apiKey', 'privateKey', 'accessToken', 'refreshToken', 'authorization',
]);

function sha256Bytes(buffer) { return createHash('sha256').update(buffer).digest('hex'); }
function sha256Json(value) { return sha256Bytes(Buffer.from(JSON.stringify(value))); }
function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function hasForbiddenKey(value, seen = new Set()) {
  if (!value || typeof value !== 'object') return false;
  if (seen.has(value)) return false;
  seen.add(value);
  if (Array.isArray(value)) return value.some((item) => hasForbiddenKey(item, seen));
  return Object.entries(value).some(([key, nested]) => forbiddenKeys.has(key) || hasForbiddenKey(nested, seen));
}
function safeBundleFile(name) {
  if (typeof name !== 'string' || !name || path.basename(name) !== name || name === '.' || name === '..') return null;
  return path.join(bundleDir, name);
}
function fail(reason, checks = {}) {
  console.log(JSON.stringify({ schema: 1, gate: 'phase9.3-sealed-evidence-replay', status: 'FAIL', bundle: path.relative(root, bundleDir), reason, checks }, null, 2));
  process.exitCode = 1;
}

const checks = {};
const manifestPath = path.join(bundleDir, 'manifest.json');
const sealedFlagPath = path.join(bundleDir, 'SEALED.flag');
if (!fs.existsSync(manifestPath) || !fs.existsSync(sealedFlagPath)) {
  fail('bundle_control_files_missing', {
    manifestPresent: fs.existsSync(manifestPath),
    sealedFlagPresent: fs.existsSync(sealedFlagPath),
  });
} else {
  let manifest;
  try { manifest = readJson(manifestPath); } catch (error) { fail('manifest_invalid_json', { message: String(error?.message ?? error) }); }
  if (manifest) {
    checks.schema = manifest.schema === 1;
    checks.gate = manifest.gate === 'phase9-external-certification-sealed-bundle';
    checks.filesArray = Array.isArray(manifest.files);
    checks.packageVersion = typeof manifest.packageVersion === 'string' && manifest.packageVersion.length > 0;
    checks.safetyLiveDisabled = manifest.safety?.liveExecutionDisabled === true;
    checks.noCredentialsSerialized = manifest.safety?.credentialsSerialized === false;
    checks.noReviewerIdentitySerialized = manifest.safety?.reviewerIdentitySerialized === false;
    checks.noDatabaseConnectionStringSerialized = manifest.safety?.databaseConnectionStringSerialized === false;
    checks.bundleHashFormat = typeof manifest.bundleHash === 'string' && /^[a-f0-9]{64}$/.test(manifest.bundleHash);
    checks.noForbiddenKeysInManifest = !hasForbiddenKey(manifest);

    const sealedValue = fs.readFileSync(sealedFlagPath, 'utf8').trim();
    checks.sealedFlagMatches = sealedValue === manifest.bundleHash;

    const files = manifest.files ?? [];
    const names = files.map((entry) => entry?.path);
    checks.fileNamesUnique = new Set(names).size === names.length;
    checks.fileEntriesSafe = files.every((entry) => safeBundleFile(entry?.path) !== null && /^[a-f0-9]{64}$/.test(entry?.sha256 ?? '') && Number.isInteger(entry?.bytes));

    for (const entry of files) {
      const target = safeBundleFile(entry?.path);
      if (!target) continue;
      const exists = fs.existsSync(target);
      checks[`file:${entry.path}:present`] = exists;
      if (exists) {
        const bytes = fs.readFileSync(target);
        checks[`file:${entry.path}:bytes`] = bytes.length === entry.bytes;
        checks[`file:${entry.path}:sha256`] = sha256Bytes(bytes) === entry.sha256;
        if (entry.path.endsWith('.json')) {
          try { checks[`file:${entry.path}:credentialSafe`] = !hasForbiddenKey(JSON.parse(bytes.toString('utf8'))); }
          catch { checks[`file:${entry.path}:jsonValid`] = false; }
        }
      }
    }

    const bundleHashPayload = {
      schema: manifest.schema,
      gate: manifest.gate,
      packageVersion: manifest.packageVersion,
      certificationStatus: manifest.certificationStatus,
      preflightStatus: manifest.preflightStatus,
      evidenceHash: manifest.evidenceHash,
      files: manifest.files,
      safety: manifest.safety,
      lockfile: manifest.lockfile,
    };
    const recomputedBundleHash = sha256Json(bundleHashPayload);
    checks.bundleHashMatches = recomputedBundleHash === manifest.bundleHash;

    const evidenceName = files.find((entry) => entry?.path === 'external-certification-evidence.json')?.path;
    const evidencePath = evidenceName ? safeBundleFile(evidenceName) : null;
    if (evidencePath && fs.existsSync(evidencePath)) {
      try {
        const verification = spawnSync(process.execPath, [verifier, `--input=${evidencePath}`], {
          cwd: root, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024,
        });
        checks.evidenceReplayPass = verification.status === 0;
      } catch { checks.evidenceReplayPass = false; }
    } else {
      checks.evidenceReplayPass = false;
    }

    const failedChecks = Object.entries(checks).filter(([, ok]) => !ok).map(([name]) => name);
    const status = failedChecks.length ? 'FAIL' : 'PASS';
    console.log(JSON.stringify({
      schema: 1,
      gate: 'phase9.3-sealed-evidence-replay',
      status,
      bundle: path.relative(root, bundleDir),
      packageVersion: manifest.packageVersion,
      bundleHash: manifest.bundleHash,
      checks,
      failedChecks,
      replaySafe: status === 'PASS',
    }, null, 2));
    if (status === 'FAIL') process.exitCode = 1;
  }
}

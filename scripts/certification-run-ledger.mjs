#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

const INCLUDED_EXTENSIONS = new Set(['.ts','.tsx','.mts','.mjs','.js','.jsx']);
const EXCLUDED_DIRS = new Set(['node_modules','.git','artifacts','dist','coverage']);

function sha256Bytes(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
function sha256Text(text) { return sha256Bytes(Buffer.from(text, 'utf8')); }
function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a,b) => a.name.localeCompare(b.name))) {
    if (EXCLUDED_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (INCLUDED_EXTENSIONS.has(path.extname(entry.name))) out.push(full);
  }
  return out;
}
function sourceTreeHash() {
  const files = walk(root).sort();
  const digest = createHash('sha256');
  const manifest = [];
  for (const file of files) {
    const rel = path.relative(root, file).replaceAll(path.sep, '/');
    const bytes = fs.readFileSync(file);
    const hash = sha256Bytes(bytes);
    manifest.push({ path: rel, sha256: hash, bytes: bytes.length });
    digest.update(rel).update('\0').update(hash).update('\0');
  }
  return { sha256: digest.digest('hex'), fileCount: files.length, manifest };
}
function commandVersion(command, args) {
  const executable = process.platform === 'win32' && command === 'npm' ? 'npm.cmd' : command;
  try { return execFileSync(executable, args, { cwd: root, encoding: 'utf8' }).trim(); }
  catch { return 'unavailable'; }
}
function canonicalHash(value) {
  return sha256Text(JSON.stringify(value));
}

const packageBytes = fs.readFileSync(path.join(root, 'package.json'));
const lockBytes = fs.readFileSync(path.join(root, 'package-lock.json'));
const source = sourceTreeHash();
const evidencePath = path.join(root, 'artifacts', 'external-certification-evidence.json');
const preflightPath = path.join(root, 'artifacts', 'phase9-external-certification-preflight.json');
const evidencePresent = fs.existsSync(evidencePath);
const preflightPresent = fs.existsSync(preflightPath);
const evidenceHash = evidencePresent ? sha256Bytes(fs.readFileSync(evidencePath)) : null;
const preflightHash = preflightPresent ? sha256Bytes(fs.readFileSync(preflightPath)) : null;
const runId = randomUUID();
const record = {
  schemaVersion: 1,
  runId,
  gate: 'phase9-certification-run-ledger',
  generatedAt: new Date().toISOString(),
  packageVersion: pkg.version,
  packageJsonSha256: sha256Bytes(packageBytes),
  packageLockSha256: sha256Bytes(lockBytes),
  sourceTreeSha256: source.sha256,
  sourceFileCount: source.fileCount,
  nodeVersion: process.version,
  npmVersion: commandVersion('npm', ['--version']),
  platform: process.platform,
  evidencePresent,
  evidenceSha256: evidenceHash,
  preflightPresent,
  preflightSha256: preflightHash,
  liveExecutionDisabled: process.env.HELIX_LIVE_EXECUTION !== 'true',
  externalCertificationPass: process.env.HELIX_EXTERNAL_CERTIFICATION_PASS === 'true',
  status: process.env.HELIX_EXTERNAL_CERTIFICATION_PASS === 'true' ? 'PASS' : 'PENDING_EXTERNAL_PASS',
};
record.recordHash = canonicalHash(record);

const artifactDir = path.join(root, 'artifacts');
fs.mkdirSync(artifactDir, { recursive: true });
fs.writeFileSync(path.join(artifactDir, 'certification-run-ledger.json'), `${JSON.stringify(record, null, 2)}\n`);
console.log(JSON.stringify(record, null, 2));
process.exitCode = 0;

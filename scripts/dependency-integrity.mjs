#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));

function npmCommand() {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm';
}
function versionParts(value) {
  const m = /^v?(\d+)\.(\d+)\.(\d+)/.exec(value);
  if (!m) throw new Error(`invalid_version:${value}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}
function readInstalledVersion(name) {
  const pkgPath = path.join(root, 'node_modules', ...name.split('/'), 'package.json');
  if (!fs.existsSync(pkgPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(pkgPath, 'utf8')).version ?? null;
  } catch {
    return null;
  }
}

const reasons = [];
const node = versionParts(process.version);
let npmVersion = '';
try {
  npmVersion = execFileSync(npmCommand(), ['--version'], { cwd: root, encoding: 'utf8' }).trim();
} catch {
  reasons.push('npm_unavailable');
}

if (node[0] !== 22) reasons.push(`node_22_required:${process.version}`);
const npmParts = npmVersion ? versionParts(npmVersion) : null;
if (!npmParts || npmParts[0] !== 10) reasons.push(`npm_10_required:${npmVersion || 'missing'}`);
if (lock.lockfileVersion !== 3) reasons.push(`lockfile_version_3_required:${lock.lockfileVersion}`);
if (lock.packages?.['']?.version !== pkg.version) reasons.push('package_lock_root_version_mismatch');

const directDeps = {
  ...(pkg.dependencies ?? {}),
  ...(pkg.devDependencies ?? {}),
};
const missing = [];
const unreadable = [];
const installed = [];
for (const name of Object.keys(directDeps).sort()) {
  const version = readInstalledVersion(name);
  if (!version) missing.push(name);
  else installed.push({ name, version, spec: directDeps[name] });
}
if (missing.length) reasons.push(`missing_direct_dependencies:${missing.join(',')}`);

const report = {
  schema: 1,
  gate: 'dependency-integrity',
  packageVersion: pkg.version,
  node: process.version,
  npm: npmVersion || null,
  directDependencyCount: Object.keys(directDeps).length,
  installedDirectDependencyCount: installed.length,
  missingDirectDependencies: missing,
  unreadablePackages: unreadable,
  status: reasons.length ? 'BLOCKED' : 'PASS',
  reasons: [...new Set(reasons)].sort(),
};

fs.mkdirSync(path.join(root, 'artifacts'), { recursive: true });
fs.writeFileSync(path.join(root, 'artifacts', 'dependency-integrity.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
process.exitCode = reasons.length ? 1 : 0;

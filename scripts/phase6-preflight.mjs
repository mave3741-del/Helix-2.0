import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const readJson = (file) => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const pkg = readJson('package.json');
const lock = readJson('package-lock.json');
const nodeMajor = Number(process.versions.node.split('.')[0]);
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const npmVersion = execFileSync(npmCommand, ['--version'], { encoding: 'utf8' }).trim();
const npmMajor = Number(npmVersion.split('.')[0]);
const reasons = [];

if (lock.packages?.['']?.version !== pkg.version) reasons.push('package-lock root version mismatch');
if (nodeMajor < 22) reasons.push(`Node ${process.versions.node} < 22`);
if (npmMajor < 10) reasons.push(`npm ${npmVersion} < 10`);
if (!fs.existsSync(path.join(root, 'scripts/release-integrity.mjs'))) reasons.push('release integrity gate missing');
if (!fs.existsSync(path.join(root, 'scripts/migration-integrity.mjs'))) reasons.push('migration integrity gate missing');

const liveExecution = process.env.HELIX_LIVE_EXECUTION === 'true';
if (liveExecution) reasons.push('HELIX_LIVE_EXECUTION=true is forbidden during Phase 6.1 certification');

console.log(JSON.stringify({
  phase: '6.1',
  packageVersion: pkg.version,
  lockVersion: lock.packages?.['']?.version ?? null,
  node: process.versions.node,
  npm: npmVersion,
  status: reasons.length === 0 ? 'PASS' : 'BLOCKED',
  reasons,
}, null, 2));

if (reasons.length) process.exit(1);

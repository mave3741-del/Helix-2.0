import { readFile } from 'node:fs/promises';
import process from 'node:process';
import { execFileSync } from 'node:child_process';

const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const lock = JSON.parse(await readFile(new URL('../package-lock.json', import.meta.url), 'utf8'));

function versionParts(version) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)/.exec(version);
  if (!match) throw new Error(`Unsupported version string: ${version}`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function majorMinor(version) {
  const [major, minor] = versionParts(version);
  return { major, minor };
}

const node = majorMinor(process.version);
const npmRaw = execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['--version'], { encoding: 'utf8' }).trim();
const npmVersion = npmRaw.match(/^(\d+)\.(\d+)\.(\d+)$/);

if (node.major !== 22) {
  throw new Error(`Node 22.x is required for certification; found ${process.version}`);
}

if (!npmVersion) {
  throw new Error(`Unable to determine npm version; npm --version returned ${npmRaw || '<empty>'}`);
}

const npmMajor = Number(npmVersion[1]);
if (npmMajor !== 10) {
  throw new Error(`npm 10.x is required for certification; found ${npmVersion[0]}`);
}

if (lock.lockfileVersion !== 3) {
  throw new Error(`package-lock.json must use lockfileVersion 3; found ${lock.lockfileVersion}`);
}

const root = lock.packages?.[''];
if (!root) throw new Error('package-lock.json is missing the root package entry');
if (root.version !== pkg.version) {
  throw new Error(`package.json version ${pkg.version} does not match lockfile root version ${root.version}`);
}

for (const section of ['dependencies', 'devDependencies']) {
  const expected = pkg[section] ?? {};
  const actual = root[section] ?? {};
  for (const [name, spec] of Object.entries(expected)) {
    if (actual[name] !== spec) {
      throw new Error(`Lockfile ${section} mismatch for ${name}: package.json=${spec}, lockfile=${actual[name]}`);
    }
  }
}

const requiredFiles = [
  '.github/workflows/ci.yml',
  'package-lock.json',
  'tsconfig.json',
  'scripts/migration-integrity.mjs',
  'scripts/db-verify.mjs',
  'scripts/db-immutability-verify.mjs',
  'scripts/phase3-final-gate.mjs',
];

for (const relative of requiredFiles) {
  await readFile(new URL(`../${relative}`, import.meta.url));
}

console.log(JSON.stringify({
  status: 'PASS',
  node: process.version,
  npm: npmVersion[0],
  lockfileVersion: lock.lockfileVersion,
  packageVersion: pkg.version,
  requiredFiles: requiredFiles.length,
}, null, 2));

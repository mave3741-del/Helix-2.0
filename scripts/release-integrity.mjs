import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const readJson = (file) => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const pkg = readJson('package.json');
const lock = readJson('package-lock.json');
const failures = [];

if (!/^\d+\.\d+\.\d+$/.test(pkg.version)) failures.push(`package.json version is invalid: ${pkg.version}`);
if (lock.packages?.['']?.version !== pkg.version) failures.push('package-lock root version must match package.json');
if (lock.packages?.['']?.name !== pkg.name) failures.push('package-lock root name must match package.json');
if (fs.existsSync(path.join(root, '.helix'))) failures.push('.helix work artifacts must not be present in a release workspace');

const previewSource = fs.readFileSync(path.join(root, 'src/lib/auth/preview.ts'), 'utf8');
if (/PREVIEW_CLIENT_SECRET\s*=/.test(previewSource)) failures.push('preview OAuth client secret must never be hard-coded in src/lib/auth/preview.ts');

const releaseScanRoots = ['src', 'scripts'];
const highConfidenceSecretPatterns = [
  [/-----BEGIN (?:RSA|EC|OPENSSH|PRIVATE) KEY-----/, 'private key material'],
  [/AKIA[0-9A-Z]{16}/, 'AWS access key'],
  [/gh[pousr]_[A-Za-z0-9_]{20,}/, 'GitHub token'],
  [/xox[baprs]-[A-Za-z0-9-]{20,}/, 'Slack token'],
  [/(?:PREVIEW|OAUTH)_CLIENT_SECRET\s*=\s*['"][^'"]{8,}['"]/, 'embedded OAuth client secret'],
];
for (const scanRoot of releaseScanRoots) {
  const base = path.join(root, scanRoot);
  if (!fs.existsSync(base)) continue;
  const stack = [base];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const target = path.join(current, entry.name);
      if (entry.isDirectory()) { stack.push(target); continue; }
      if (!/\.(?:[cm]?[jt]sx?|json|ya?ml|md|txt|env)$/i.test(entry.name)) continue;
      const text = fs.readFileSync(target, 'utf8');
      for (const [pattern, label] of highConfidenceSecretPatterns) {
        if (pattern.test(text)) failures.push(`${label} detected in ${path.relative(root, target)}`);
      }
    }
  }
}

const masterCandidates = fs.readdirSync(root).filter((name) => /^HELIX_PROJECT_MASTER_FILE_v\d+\.\d+\.docx$/i.test(name));
const versionedMasters = masterCandidates.map((name) => ({ name, version: Number(name.match(/v(\d+\.\d+)\.docx$/i)?.[1] ?? -1) })).sort((a, b) => b.version - a.version);
const currentMaster = versionedMasters[0]?.name;
const staleMasters = masterCandidates.filter((name) => name !== currentMaster);
if (staleMasters.length) failures.push(`stale root master documents remain: ${staleMasters.join(', ')}`);

if (failures.length) {
  console.error('RELEASE INTEGRITY FAILED');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('RELEASE INTEGRITY PASS');
console.log(`version=${pkg.version}`);
console.log('lockfile=aligned');
console.log('preview_secret=not_embedded');
console.log('workspace_artifacts=absent');
console.log(`current_master=${currentMaster ?? 'missing'}`);
console.log('stale_master_docs=absent');

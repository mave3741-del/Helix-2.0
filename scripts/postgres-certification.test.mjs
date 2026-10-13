import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const script = path.join(root, 'scripts', 'postgres-certification.mjs');
const artifact = path.join(root, 'artifacts', 'postgres-certification-evidence.json');

function run(env = {}) {
  const nextEnv = { ...process.env, ...env };
  delete nextEnv.DATABASE_URL;
  try {
    return execFileSync(process.execPath, [script], {
      cwd: root,
      env: { ...nextEnv, ...env },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    return String(error?.stdout ?? '');
  }
}

test('postgres certification gate blocks without DATABASE_URL and emits safe evidence', async () => {
  await rm(artifact, { force: true });
  const output = run();
  const report = JSON.parse(output);
  assert.equal(report.status, 'BLOCKED');
  assert.deepEqual(report.prerequisites.reasons, ['DATABASE_URL_required']);
  assert.equal(report.database.passwordExposed, false);
  assert.equal(report.database.rawConnectionStringExposed, false);
  const stored = JSON.parse(await readFile(artifact, 'utf8'));
  assert.equal(stored.status, 'BLOCKED');
});

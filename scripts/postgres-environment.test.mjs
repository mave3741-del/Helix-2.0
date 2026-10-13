import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

const root = process.cwd();

function run(extraEnv = {}) {
  const output = execFileSync(process.execPath, ['scripts/postgres-environment.mjs'], {
    cwd: root,
    env: { ...process.env, ...extraEnv },
    encoding: 'utf8',
  });
  return JSON.parse(output);
}

test('postgres environment probe is dependency-free and emits safe schema', () => {
  const result = run({ PGHOST: '127.0.0.1', PGPORT: '55432', DATABASE_URL: 'postgres://secret:password@127.0.0.1/db' });
  assert.equal(result.schemaVersion, 1);
  assert.equal(result.gate, 'phase9-postgresql-environment');
  assert.equal(result.port, 55432);
  assert.equal(result.passwordExposed, false);
  assert.equal(result.connectionStringExposed, false);
  assert.equal(result.databaseUrlConfigured, true);
});

test('postgres environment probe never treats TCP reachability as certification', () => {
  const result = run({ PGHOST: '127.0.0.1', PGPORT: '55433' });
  assert.notEqual(result.status, 'EXTERNAL_CERTIFIED');
  assert.equal(result.passwordExposed, false);
});

test('invalid PGPORT safely falls back to 5432', () => {
  const result = run({ PGHOST: '127.0.0.1', PGPORT: 'not-a-port' });
  assert.equal(result.port, 5432);
});

test('status distinguishes installed runtime from reachable server', () => {
  const result = run({ PGHOST: '127.0.0.1', PGPORT: '55434' });
  assert.ok(['PENDING_POSTGRESQL', 'READY_FOR_DATABASE_VERIFICATION'].includes(result.status));
  if (!result.serverTcpReachable) assert.equal(result.status, 'PENDING_POSTGRESQL');
});

test('probe output contains no DATABASE_URL value', () => {
  const secretUrl = 'postgres://user:VERY_SECRET@127.0.0.1/db';
  const raw = execFileSync(process.execPath, ['scripts/postgres-environment.mjs'], {
    cwd: root,
    env: { ...process.env, DATABASE_URL: secretUrl, PGPORT: '55435' },
    encoding: 'utf8',
  });
  assert.equal(raw.includes('VERY_SECRET'), false);
  assert.equal(raw.includes(secretUrl), false);
});

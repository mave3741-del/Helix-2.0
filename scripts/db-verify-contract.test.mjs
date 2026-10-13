import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const verify = await readFile(new URL('./db-verify.mjs', import.meta.url), 'utf8');
const smoke = await readFile(new URL('./db-smoke.mjs', import.meta.url), 'utf8');

test('production verifier checks cycle-health schema and deployed migration hashes', () => {
  assert.match(verify, /trading_cycle_health_audits/);
  assert.match(verify, /cycle_health_decision_hash_unique_index_missing/);
  assert.match(verify, /migration_content_hash_missing/);
  assert.match(verify, /migration_content_hash_mismatch/);
});

test('database smoke covers cycle-health uniqueness and migration content hashes', () => {
  assert.match(smoke, /content_sha256/);
  assert.match(smoke, /cycle_health_audit_table_missing/);
  assert.match(smoke, /cycle_health_decision_hash_unique_missing/);
});

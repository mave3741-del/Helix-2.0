import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync('scripts/db-verify.mjs', 'utf8');

test('real PostgreSQL verifier does not rely on fragile unique-index text ordering', () => {
  assert.match(source, /information_schema\.table_constraints/);
  assert.doesNotMatch(source, /indexdef like ['"]%decision_hash%unique%['"]/i);
  assert.doesNotMatch(source, /indexdef like ['"]%unique%decision_hash%['"]/i);
});

test('real PostgreSQL verifier contains explicit schema-level uniqueness checks', () => {
  assert.match(source, /information_schema\.table_constraints|pg_constraint|pg_index/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const sql = await readFile(new URL('../migrations/0020_closed_loop_scheduler_hash.sql', import.meta.url), 'utf8');
const store = await readFile(new URL('../src/trading/learning/closed-loop.ts', import.meta.url), 'utf8');

test('closed-loop decision hash has a database uniqueness contract', () => {
  assert.match(sql, /create unique index/i);
  assert.match(sql, /trading_closed_loop_cycles_hash_idx/i);
  assert.match(sql, /decision_hash/i);
  assert.match(store, /on conflict \(cycle_id\) do nothing/i);
});


const healthMigration = await readFile(new URL('../migrations/0024_cycle_health_immutable.sql', import.meta.url), 'utf8');
test('cycle-health audit is append-only at database level', () => {
  assert.match(healthMigration, /before update or delete/i);
  assert.match(healthMigration, /trading_cycle_health_audits_immutable_trg/i);
  assert.match(healthMigration, /cycle_health_audit_append_only/i);
});

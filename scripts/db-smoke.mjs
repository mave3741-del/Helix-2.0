#!/usr/bin/env node
import { readdir, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { pendingMigrations } from './migration-plan.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(root, '..', 'migrations');
const files = (await readdir(migrationsDir)).filter((x) => x.endsWith('.sql'));
const pg = new PGlite();
await pg.exec('create table _migrations (name text primary key, applied_at timestamptz not null default now(), content_sha256 text)');
for (const { name } of pendingMigrations(files, [])) {
  const sql = await readFile(join(migrationsDir, name), 'utf8');
  await pg.exec(sql);
  const { createHash } = await import('node:crypto');
  const hash = createHash('sha256').update(sql).digest('hex');
  await pg.query('insert into _migrations(name, content_sha256) values($1, $2)', [name, hash]);
}
const columns = await pg.query(`select column_name from information_schema.columns where table_name = 'trading_strategy_performance_snapshots' and column_name in ('wins','losses') order by column_name`);
if (columns.rows.length !== 2) throw new Error('wins_losses_columns_missing');
const table = 'trading_strategy_performance_snapshots';
await pg.query(`insert into ${table} (snapshot_id, strategy_id, as_of_ts, trade_count, net_pnl, max_drawdown, profit_factor, win_rate, expectancy, by_regime, attribution_hash, wins, losses) values ($1,$2,to_timestamp($3 / 1000.0),$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`, ['db-smoke-1','db-smoke-strategy',1,10,100,0.1,1.8,0.6,10,JSON.stringify({}), 'db-smoke-hash',6,4]);
const rows = await pg.query(`select wins, losses from ${table} where snapshot_id=$1`, ['db-smoke-1']);
if (Number(rows.rows[0]?.wins) !== 6 || Number(rows.rows[0]?.losses) !== 4) throw new Error('wins_losses_roundtrip_failed');
const healthTable = await pg.query("select to_regclass('trading_cycle_health_audits') as table_name");
if (!healthTable.rows[0]?.table_name) throw new Error('cycle_health_audit_table_missing');
// Not `pg_indexes.indexdef like '%decision_hash%unique%'`: Postgres always
// renders a unique index as `CREATE UNIQUE INDEX ... (decision_hash)` —
// "UNIQUE" comes *before* the column name, so that pattern can never match
// and this check silently could not fail even when the column truly lacked
// a unique constraint. Checking information_schema.table_constraints
// directly verifies the actual constraint on the actual column.
const healthUnique = await pg.query(`
  select 1 from information_schema.table_constraints tc
  join information_schema.key_column_usage kcu on tc.constraint_name = kcu.constraint_name and tc.table_schema = kcu.table_schema
  where tc.table_name = 'trading_cycle_health_audits' and tc.constraint_type = 'UNIQUE' and kcu.column_name = 'decision_hash'
`);
if (!healthUnique.rows.length) throw new Error('cycle_health_decision_hash_unique_missing');
const migrationRows = await pg.query('select name, content_sha256 from _migrations');
const numberedMigrations = files.filter((x) => /^\d{4}_.+\.sql$/.test(x));
if (migrationRows.rows.length !== numberedMigrations.length) throw new Error('migration_hash_count_mismatch');
if (migrationRows.rows.some((r) => !r.content_sha256)) throw new Error('migration_content_hash_missing');
console.log('[db-smoke] PASS — migrations applied with content hashes; cycle-health schema/unique hash and wins/losses round-trip verified.');
await pg.close();

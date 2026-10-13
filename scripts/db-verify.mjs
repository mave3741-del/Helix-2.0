#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) {
  console.error('[db-verify] DATABASE_URL is required for real Postgres/Neon verification.');
  process.exit(2);
}
const { default: pg } = await import('pg');

const root = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(root, '..', 'migrations');
const files = (await readdir(migrationsDir)).filter((name) => /^\d{4}_.+\.sql$/.test(name)).sort();
const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
const client = await pool.connect();
try {
  await client.query('CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())');
  const applied = (await client.query('SELECT name FROM _migrations ORDER BY name')).rows.map((r) => String(r.name));
  const pending = files.filter((name) => !applied.includes(name));
  if (pending.length) throw new Error(`pending_migrations:${pending.join(',')}`);

  const requiredTables = [
    'trading_closed_loop_cycles',
    'trading_strategy_performance_snapshots',
    'trading_strategy_outcome_rollups',
    'trading_portfolio_governance_runs',
    'trading_champion_portfolio_reconciliations',
    'trading_cycle_health_audits',
    'trading_portfolio_governance_runs',
    'trading_champion_portfolio_reconciliations',
  ];
  for (const table of requiredTables) {
    const result = await client.query('select to_regclass($1) as table_name', [table]);
    if (!result.rows[0]?.table_name) throw new Error(`missing_table:${table}`);
  }

  const requiredColumns = {
    trading_closed_loop_cycles: ['decision_hash', 'fail_closed', 'champion_strategy_id'],
    trading_strategy_performance_snapshots: ['wins', 'losses', 'attribution_hash'],
    trading_cycle_health_audits: ['status', 'score', 'decision_hash', 'reconciliation_hash'],
    trading_portfolio_governance_runs: ['run_id', 'cycle_id', 'status', 'allocations'],
    trading_champion_portfolio_reconciliations: ['reconciliation_id', 'cycle_id', 'closed_loop_decision_hash', 'champion_decision_hash', 'governance_run_id', 'decision_hash'],
    trading_phase7_paper_operation_sessions: ['session_id', 'state', 'snapshot', 'snapshot_hash', 'recovery_count'],
    trading_phase7_paper_canary_cohorts: ['cohort_id', 'state', 'snapshot', 'snapshot_hash'],
    trading_phase7_paper_canary_observations: ['observation_id', 'cohort_id', 'cycle_id', 'session_id', 'observed_at', 'observation'],
    trading_phase7_paper_canary_comparisons: ['comparison_id', 'comparison', 'evidence_hash'],
    trading_phase7_independent_post_canary_reviews: ['review_id', 'status', 'reviewer_id', 'implementer_id', 'review_snapshot', 'evidence_hash'],
  };
  for (const [table, columns] of Object.entries(requiredColumns)) {
    const result = await client.query(
      `select column_name from information_schema.columns where table_schema='public' and table_name=$1 and column_name = any($2::text[])`,
      [table, columns],
    );
    const found = new Set(result.rows.map((r) => String(r.column_name)));
    for (const column of columns) if (!found.has(column)) throw new Error(`missing_column:${table}.${column}`);
  }

  const uniqueHash = await client.query(`
    select 1
    from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu
      on tc.constraint_name = kcu.constraint_name and tc.table_schema = kcu.table_schema
    where tc.table_schema='public'
      and tc.table_name='trading_closed_loop_cycles'
      and tc.constraint_type='UNIQUE'
      and kcu.column_name='decision_hash'
  `);
  if (!uniqueHash.rows.length) throw new Error('closed_loop_decision_hash_unique_index_missing');
  const healthUniqueHash = await client.query(`
    select 1
    from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu
      on tc.constraint_name = kcu.constraint_name and tc.table_schema = kcu.table_schema
    where tc.table_schema='public'
      and tc.table_name='trading_cycle_health_audits'
      and tc.constraint_type='UNIQUE'
      and kcu.column_name='decision_hash'
  `);
  if (!healthUniqueHash.rows.length) throw new Error('cycle_health_decision_hash_unique_index_missing');
  const immutableTrigger = await client.query(`select tgname from pg_trigger where tgrelid='public.trading_cycle_health_audits'::regclass and not tgisinternal and tgname='trading_cycle_health_audits_immutable_trg'`);
  if (!immutableTrigger.rows.length) throw new Error('cycle_health_immutable_trigger_missing');

  const migrationHashes = new Map();
  for (const name of files) {
    const text = await readFile(join(migrationsDir, name));
    migrationHashes.set(name, createHash('sha256').update(text).digest('hex'));
  }

  const deployedHashes = new Map(
    (await client.query('SELECT name, content_sha256 FROM _migrations WHERE content_sha256 IS NOT NULL')).rows
      .map((r) => [String(r.name), String(r.content_sha256)]),
  );
  for (const [name, expected] of migrationHashes) {
    const actual = deployedHashes.get(name);
    if (!actual) throw new Error(`migration_content_hash_missing:${name}`);
    if (actual !== expected) throw new Error(`migration_content_hash_mismatch:${name}`);
  }
  console.log(`[db-verify] PASS — ${files.length} migrations, content hashes, health audit schema, required columns and hash uniqueness verified.`);
  console.log(`[db-verify] Verified migration hashes: ${migrationHashes.size}`);
} finally {
  client.release();
  await pool.end();
}

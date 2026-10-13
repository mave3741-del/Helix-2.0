#!/usr/bin/env node
const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) {
  console.error('[db-immutability] DATABASE_URL is required for staging verification.');
  process.exit(2);
}
const { default: pg } = await import('pg');
const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
const client = await pool.connect();
try {
  await client.query('begin');
  const trigger = await client.query(`select tgname from pg_trigger where tgrelid='public.trading_cycle_health_audits'::regclass and not tgisinternal and tgname='trading_cycle_health_audits_immutable_trg'`);
  if (!trigger.rows.length) throw new Error('cycle_health_immutable_trigger_missing');
  const cycleId = `__immutability_verify__:${Date.now()}`;
  await client.query(`insert into trading_closed_loop_cycles (cycle_id, as_of_ts, fail_closed, reasons, decision_hash) values ($1, now(), false, '[]'::jsonb, $2)`, [cycleId, `__cycle_hash__:${Date.now()}`]);
  await client.query(`insert into trading_cycle_health_audits (cycle_id, status, score, reasons, decision_hash) values ($1,'healthy',1,'[]'::jsonb,$2)`, [cycleId, `__health_hash__:${Date.now()}`]);

  await client.query('savepoint immutability_update');
  let updateRejected = false;
  try { await client.query(`update trading_cycle_health_audits set score=0 where cycle_id=$1`, [cycleId]); } catch (error) { updateRejected = String(error?.message ?? error).includes('cycle_health_audit_append_only'); }
  await client.query('rollback to savepoint immutability_update');
  if (!updateRejected) throw new Error('cycle_health_update_not_rejected');

  await client.query('savepoint immutability_delete');
  let deleteRejected = false;
  try { await client.query(`delete from trading_cycle_health_audits where cycle_id=$1`, [cycleId]); } catch (error) { deleteRejected = String(error?.message ?? error).includes('cycle_health_audit_append_only'); }
  await client.query('rollback to savepoint immutability_delete');
  if (!deleteRejected) throw new Error('cycle_health_delete_not_rejected');

  await client.query('rollback');
  console.log('[db-immutability] PASS — cycle-health append-only trigger rejected UPDATE and DELETE inside a disposable transaction.');
} catch (error) {
  try { await client.query('rollback'); } catch {
    // Best-effort cleanup rollback while already handling an error; the
    // connection is about to be released either way.
  }
  throw error;
} finally {
  client.release();
  await pool.end();
}

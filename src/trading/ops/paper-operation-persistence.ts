import type { PaperOperationSnapshot } from './paper-operations.ts';
import { PaperOperationSession, verifyPaperOperationSnapshot } from './paper-operations.ts';

export interface PaperOperationSessionStore {
  save(snapshot: PaperOperationSnapshot, recoveryCount?: number): Promise<void>;
  load(sessionId: string): Promise<PaperOperationSnapshot | null>;
  recover(sessionId: string, at?: number): Promise<PaperOperationSnapshot | null>;
}

export class InMemoryPaperOperationSessionStore implements PaperOperationSessionStore {
  private readonly snapshots = new Map<string, PaperOperationSnapshot>();
  private readonly recoveryCounts = new Map<string, number>();

  async save(snapshot: PaperOperationSnapshot, recoveryCount = this.recoveryCounts.get(snapshot.sessionId) ?? 0): Promise<void> {
    verifyPaperOperationSnapshot(snapshot);
    this.snapshots.set(snapshot.sessionId, structuredClone(snapshot));
    this.recoveryCounts.set(snapshot.sessionId, recoveryCount);
  }

  async load(sessionId: string): Promise<PaperOperationSnapshot | null> {
    const snapshot = this.snapshots.get(sessionId);
    return snapshot ? structuredClone(snapshot) : null;
  }

  async recover(sessionId: string, at = Date.now()): Promise<PaperOperationSnapshot | null> {
    const current = await this.load(sessionId);
    if (!current) return null;
    const session = PaperOperationSession.restore(current);
    const recovered = session.recoverAfterRestart(at);
    const count = (this.recoveryCounts.get(sessionId) ?? 0) + 1;
    await this.save(recovered, count);
    return recovered;
  }
}

interface SqlLike {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
}

export class SqlPaperOperationSessionStore implements PaperOperationSessionStore {
  private sqlPromise: Promise<SqlLike> | null = null;

  private sql(): Promise<SqlLike> {
    this.sqlPromise ??= import('../../lib/db.ts').then(({ getSql }) => getSql());
    return this.sqlPromise;
  }

  async save(snapshot: PaperOperationSnapshot, recoveryCount?: number): Promise<void> {
    verifyPaperOperationSnapshot(snapshot);
    const sql = await this.sql();
    await sql.query(
      `insert into trading_phase7_paper_operation_sessions
        (session_id, state, snapshot, snapshot_hash, recovery_count, updated_at)
       values ($1,$2,$3::jsonb,$4,coalesce($5,0),now())
       on conflict (session_id) do update set
         state=excluded.state,
         snapshot=excluded.snapshot,
         snapshot_hash=excluded.snapshot_hash,
         recovery_count=coalesce($5, trading_phase7_paper_operation_sessions.recovery_count),
         updated_at=now()`,
      [snapshot.sessionId, snapshot.state, JSON.stringify(snapshot), snapshot.snapshotHash, recoveryCount ?? null],
    );
  }

  async load(sessionId: string): Promise<PaperOperationSnapshot | null> {
    const sql = await this.sql();
    const rows = await sql.query<Record<string, unknown>>(
      `select snapshot, snapshot_hash from trading_phase7_paper_operation_sessions where session_id=$1`,
      [sessionId],
    );
    const row = rows[0];
    if (!row) return null;
    const snapshot = typeof row.snapshot === 'string' ? JSON.parse(row.snapshot) as PaperOperationSnapshot : row.snapshot as PaperOperationSnapshot;
    verifyPaperOperationSnapshot(snapshot);
    if (String(row.snapshot_hash) !== snapshot.snapshotHash) throw new Error('paper_operation_persisted_hash_mismatch');
    return snapshot;
  }

  async recover(sessionId: string, at = Date.now()): Promise<PaperOperationSnapshot | null> {
    const current = await this.load(sessionId);
    if (!current) return null;
    const session = PaperOperationSession.restore(current);
    const recovered = session.recoverAfterRestart(at);
    const sql = await this.sql();
    await sql.query(
      `update trading_phase7_paper_operation_sessions
          set state=$2, snapshot=$3::jsonb, snapshot_hash=$4,
              recovery_count=recovery_count+1, updated_at=now()
        where session_id=$1`,
      [sessionId, recovered.state, JSON.stringify(recovered), recovered.snapshotHash],
    );
    return recovered;
  }
}

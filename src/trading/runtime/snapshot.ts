import type { PaperExecutionSnapshot } from "./paper-exchange.ts";
import type { RuntimeState } from "./runtime.ts";
import type { PaperPostTradeTrackerState } from "../post-trade.ts";

export interface RuntimeEventCursor {
  ts: number;
  eventId: string;
}

export interface TradingRuntimeSnapshot {
  schemaVersion: 1;
  runtimeId: string;
  savedAt: number;
  runtimeState: RuntimeState;
  paper: PaperExecutionSnapshot;
  eventCursor: RuntimeEventCursor | null;
  postTrade?: PaperPostTradeTrackerState;
}

export interface RuntimeSnapshotStore {
  save(snapshot: TradingRuntimeSnapshot): Promise<boolean>;
  latest(runtimeId: string): Promise<TradingRuntimeSnapshot | null>;
}

function clone<T>(value: T): T { return structuredClone(value); }

export class InMemoryRuntimeSnapshotStore implements RuntimeSnapshotStore {
  private readonly snapshots = new Map<string, TradingRuntimeSnapshot>();

  async save(snapshot: TradingRuntimeSnapshot): Promise<boolean> {
    this.snapshots.set(snapshot.runtimeId, clone(snapshot));
    return true;
  }

  async latest(runtimeId: string): Promise<TradingRuntimeSnapshot | null> {
    const snapshot = this.snapshots.get(runtimeId);
    return snapshot ? clone(snapshot) : null;
  }
}

interface SqlLike { query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>; }

function decode(value: unknown): unknown {
  return typeof value === "string" ? JSON.parse(value) : value;
}

function fromRow(row: Record<string, unknown>): TradingRuntimeSnapshot {
  return {
    schemaVersion: Number(row.schema_version) as 1,
    runtimeId: String(row.runtime_id),
    savedAt: new Date(String(row.saved_at)).getTime(),
    runtimeState: decode(row.runtime_state) as RuntimeState,
    paper: decode(row.paper_state) as PaperExecutionSnapshot,
    eventCursor: row.event_cursor == null ? null : decode(row.event_cursor) as RuntimeEventCursor,
    postTrade: row.post_trade == null ? undefined : decode(row.post_trade) as PaperPostTradeTrackerState,
  };
}

export class SqlRuntimeSnapshotStore implements RuntimeSnapshotStore {
  private sqlPromise: Promise<SqlLike> | null = null;

  private sql(): Promise<SqlLike> {
    this.sqlPromise ??= import("../../lib/db.ts").then(({ getSql }) => getSql());
    return this.sqlPromise;
  }

  async save(snapshot: TradingRuntimeSnapshot): Promise<boolean> {
    const sql = await this.sql();
    await sql.query(
      `insert into trading_runtime_snapshots
        (runtime_id, schema_version, saved_at, runtime_state, paper_state, event_cursor, post_trade)
       values ($1, $2, to_timestamp($3/1000.0), $4::jsonb, $5::jsonb, $6::jsonb, $7::jsonb)`,
      [snapshot.runtimeId, snapshot.schemaVersion, snapshot.savedAt, JSON.stringify(snapshot.runtimeState), JSON.stringify(snapshot.paper), JSON.stringify(snapshot.eventCursor), JSON.stringify(snapshot.postTrade ?? null)],
    );
    return true;
  }

  async latest(runtimeId: string): Promise<TradingRuntimeSnapshot | null> {
    const sql = await this.sql();
    const rows = await sql.query<Record<string, unknown>>(
      `select runtime_id, schema_version, saved_at, runtime_state, paper_state, event_cursor, post_trade
       from trading_runtime_snapshots where runtime_id=$1 order by snapshot_id desc limit 1`,
      [runtimeId],
    );
    return rows[0] ? fromRow(rows[0]) : null;
  }
}

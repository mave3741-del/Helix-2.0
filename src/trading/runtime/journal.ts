import type { MarketTick } from "../latency.ts";
import type { TradingEvent } from "./event-bus.ts";

interface SqlLike {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
}

export interface TradingEventQuery {
  afterTs?: number;
  afterEventId?: string;
  type?: string;
  limit?: number;
}

export interface TradingEventJournal {
  append<T>(event: TradingEvent<T>): Promise<boolean>;
  getById(id: string): Promise<TradingEvent | null>;
  list(query?: TradingEventQuery): Promise<TradingEvent[]>;
}

function asEvent(row: Record<string, unknown>): TradingEvent {
  return {
    id: String(row.event_id),
    type: String(row.event_type),
    ts: Number(row.event_ts),
    source: String(row.source),
    payload: typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload,
  };
}

export class InMemoryTradingEventJournal implements TradingEventJournal {
  private readonly events = new Map<string, TradingEvent>();

  async append<T>(event: TradingEvent<T>): Promise<boolean> {
    if (this.events.has(event.id)) return false;
    this.events.set(event.id, structuredClone(event));
    return true;
  }

  async getById(id: string): Promise<TradingEvent | null> {
    const event = this.events.get(id);
    return event ? structuredClone(event) : null;
  }

  async list(query: TradingEventQuery = {}): Promise<TradingEvent[]> {
    const afterTs = query.afterTs ?? -Infinity;
    const afterEventId = query.afterEventId ?? "";
    const limit = Math.min(10_000, Math.max(1, query.limit ?? 1_000));
    return [...this.events.values()]
      .filter((event) => event.ts > afterTs || (event.ts === afterTs && event.id > afterEventId))
      .filter((event) => !query.type || event.type === query.type)
      .sort((a, b) => a.ts - b.ts || a.id.localeCompare(b.id))
      .slice(0, limit)
      .map((event) => structuredClone(event));
  }
}

/** Production/default journal: Neon when configured, PGLite for local preview. */
export class SqlTradingEventJournal implements TradingEventJournal {
  private sqlPromise: Promise<SqlLike> | null = null;

  private sql(): Promise<SqlLike> {
    this.sqlPromise ??= import("../../lib/db.ts").then(({ getSql }) => getSql());
    return this.sqlPromise;
  }

  async append<T>(event: TradingEvent<T>): Promise<boolean> {
    const sql = await this.sql();
    const inserted = await sql.query<{ event_id: string }>(
      `insert into trading_event_journal (event_id, event_type, event_ts, source, payload)
       values ($1, $2, $3, $4, $5::jsonb)
       on conflict (event_id) do nothing
       returning event_id`,
      [event.id, event.type, event.ts, event.source, JSON.stringify(event.payload)],
    );
    return inserted.length > 0;
  }

  async getById(id: string): Promise<TradingEvent | null> {
    const sql = await this.sql();
    const rows = await sql.query<Record<string, unknown>>(
      `select event_id, event_type, event_ts, source, payload
       from trading_event_journal where event_id = $1 limit 1`,
      [id],
    );
    return rows[0] ? asEvent(rows[0]) : null;
  }

  async list(query: TradingEventQuery = {}): Promise<TradingEvent[]> {
    const sql = await this.sql();
    const afterTs = query.afterTs ?? -1;
    const afterEventId = query.afterEventId ?? "";
    const type = query.type ?? null;
    const limit = Math.min(10_000, Math.max(1, query.limit ?? 1_000));
    const rows = await sql.query<Record<string, unknown>>(
      `select event_id, event_type, event_ts, source, payload
       from trading_event_journal
       where (event_ts > $1 or (event_ts = $1 and event_id > $2))
         and ($3::text is null or event_type = $3)
       order by event_ts asc, event_id asc
       limit $4`,
      [afterTs, afterEventId, type, limit],
    );
    return rows.map(asEvent);
  }
}

export interface RecordedMarketTick {
  eventId: string;
  tick: MarketTick;
}

export interface MarketTickRangeQuery {
  symbol?: string;
  venue?: string;
  fromTs?: number;
  toTs?: number;
  limit?: number;
}

export interface MarketTickRecorder {
  record(event: TradingEvent<MarketTick>): Promise<void>;
  list(symbol?: string, limit?: number): Promise<MarketTick[]>;
  listRange(query?: MarketTickRangeQuery): Promise<RecordedMarketTick[]>;
}

export class InMemoryMarketTickRecorder implements MarketTickRecorder {
  private readonly ticks = new Map<string, RecordedMarketTick>();

  async record(event: TradingEvent<MarketTick>): Promise<void> {
    if (event.type !== "market.tick") throw new Error("market_tick_recorder_requires_market_tick");
    this.ticks.set(event.id, { eventId: event.id, tick: structuredClone(event.payload) });
  }

  async list(symbol?: string, limit = 1_000): Promise<MarketTick[]> {
    return [...this.ticks.values()]
      .filter(({ tick }) => !symbol || tick.symbol === symbol)
      .sort((a, b) => a.tick.exchangeTs - b.tick.exchangeTs || a.tick.sequence - b.tick.sequence || a.eventId.localeCompare(b.eventId))
      .slice(0, Math.min(10_000, Math.max(1, limit)))
      .map(({ tick }) => structuredClone(tick));
  }

  async listRange(query: MarketTickRangeQuery = {}): Promise<RecordedMarketTick[]> {
    const fromTs = query.fromTs ?? -Infinity;
    const toTs = query.toTs ?? Infinity;
    const limit = Math.min(10_000, Math.max(1, query.limit ?? 10_000));
    return [...this.ticks.values()]
      .filter(({ tick }) => (!query.symbol || tick.symbol === query.symbol)
        && (!query.venue || tick.venue === query.venue)
        && tick.exchangeTs >= fromTs
        && tick.exchangeTs <= toTs)
      .sort((a, b) => a.tick.exchangeTs - b.tick.exchangeTs || a.tick.sequence - b.tick.sequence || a.eventId.localeCompare(b.eventId))
      .slice(0, limit)
      .map((item) => structuredClone(item));
  }
}

export class SqlMarketTickRecorder implements MarketTickRecorder {
  private sqlPromise: Promise<SqlLike> | null = null;

  private sql(): Promise<SqlLike> {
    this.sqlPromise ??= import("../../lib/db.ts").then(({ getSql }) => getSql());
    return this.sqlPromise;
  }

  async record(event: TradingEvent<MarketTick>): Promise<void> {
    if (event.type !== "market.tick") throw new Error("market_tick_recorder_requires_market_tick");
    const tick = event.payload;
    const sql = await this.sql();
    await sql.query(
      `insert into trading_market_ticks
        (event_id, symbol, venue, market, exchange_ts, received_ts, sequence, bid, ask, last, bid_size, ask_size, payload)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb)
       on conflict (event_id) do nothing`,
      [
        event.id, tick.symbol, tick.venue, tick.market, tick.exchangeTs, tick.receivedTs,
        tick.sequence, tick.bid, tick.ask, tick.last, tick.bidSize, tick.askSize, JSON.stringify(tick),
      ],
    );
  }

  async list(symbol?: string, limit = 1_000): Promise<MarketTick[]> {
    const sql = await this.sql();
    const rows = await sql.query<Record<string, unknown>>(
      `select payload from trading_market_ticks
       where ($1::text is null or symbol = $1)
       order by exchange_ts asc, sequence asc
       limit $2`,
      [symbol ?? null, Math.min(10_000, Math.max(1, limit))],
    );
    return rows.map((row) => (typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload) as MarketTick);
  }

  async listRange(query: MarketTickRangeQuery = {}): Promise<RecordedMarketTick[]> {
    const sql = await this.sql();
    const symbol = query.symbol ?? null;
    const venue = query.venue ?? null;
    const fromTs = query.fromTs ?? -1;
    const toTs = query.toTs ?? Number.MAX_SAFE_INTEGER;
    const limit = Math.min(10_000, Math.max(1, query.limit ?? 10_000));
    const rows = await sql.query<Record<string, unknown>>(
      `select event_id, payload
       from trading_market_ticks
       where ($1::text is null or symbol = $1)
         and ($2::text is null or venue = $2)
         and exchange_ts >= $3
         and exchange_ts <= $4
       order by exchange_ts asc, sequence asc, event_id asc
       limit $5`,
      [symbol, venue, fromTs, toTs, limit],
    );
    return rows.map((row) => ({
      eventId: String(row.event_id),
      tick: (typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload) as MarketTick,
    }));
  }
}

-- Durable trading event journal + raw market tick recording.
-- Append-only event records are the authoritative recovery/replay log for the
-- server trading runtime. The raw market table keeps a query-friendly,
-- provenance-rich projection of market observations.

create table if not exists trading_event_journal (
  event_id text primary key,
  event_type text not null,
  event_ts bigint not null,
  source text not null,
  payload jsonb not null,
  recorded_at timestamptz not null default current_timestamp
);

create index if not exists trading_event_journal_ts_idx
  on trading_event_journal (event_ts, event_id);
create index if not exists trading_event_journal_type_ts_idx
  on trading_event_journal (event_type, event_ts, event_id);

create table if not exists trading_market_ticks (
  event_id text primary key references trading_event_journal(event_id) on delete cascade,
  symbol text not null,
  venue text not null,
  market text not null,
  exchange_ts bigint not null,
  received_ts bigint not null,
  sequence bigint not null,
  bid numeric not null,
  ask numeric not null,
  last numeric not null,
  bid_size numeric not null,
  ask_size numeric not null,
  recorded_at timestamptz not null default current_timestamp,
  payload jsonb not null
);

create index if not exists trading_market_ticks_symbol_ts_idx
  on trading_market_ticks (symbol, exchange_ts, event_id);
create index if not exists trading_market_ticks_venue_ts_idx
  on trading_market_ticks (venue, exchange_ts, event_id);

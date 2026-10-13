create table if not exists trading_paper_orders (
  client_order_id text primary key,
  symbol text not null,
  side text not null check (side in ('buy','sell')),
  order_type text not null check (order_type in ('market','limit')),
  requested_qty double precision not null,
  filled_qty double precision not null default 0,
  remaining_qty double precision not null,
  limit_price double precision,
  status text not null check (status in ('open','partially_filled','filled','cancelled','rejected')),
  created_ts bigint not null,
  updated_ts bigint not null,
  reject_reason text,
  payload jsonb not null default '{}'::jsonb
);

create table if not exists trading_paper_fills (
  fill_id text primary key,
  client_order_id text not null references trading_paper_orders(client_order_id),
  symbol text not null,
  side text not null check (side in ('buy','sell')),
  qty double precision not null,
  price double precision not null,
  fee double precision not null default 0,
  slippage_bps double precision not null default 0,
  fill_ts bigint not null,
  recorded_at timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb
);

create index if not exists trading_paper_orders_status_symbol_idx
  on trading_paper_orders (status, symbol, updated_ts, client_order_id);
create index if not exists trading_paper_fills_order_ts_idx
  on trading_paper_fills (client_order_id, fill_ts, fill_id);

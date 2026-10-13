create table if not exists trading_smart_money_observations (
  observation_id text primary key,
  source text not null,
  asset text not null,
  entity jsonb,
  action text not null,
  notional_usd double precision,
  quantity double precision,
  direction text,
  from_address text,
  to_address text,
  event_ts timestamptz not null,
  published_ts timestamptz not null,
  available_ts timestamptz not null,
  as_of_ts timestamptz not null,
  provenance jsonb not null,
  payload jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_trading_smart_money_asset_available on trading_smart_money_observations(asset, available_ts desc);
create index if not exists idx_trading_smart_money_entity_available on trading_smart_money_observations((entity->>'entityId'), available_ts desc);

create table if not exists trading_strategy_performance_snapshots (
  snapshot_id text primary key,
  strategy_id text not null,
  as_of_ts timestamptz not null,
  trade_count integer not null,
  net_pnl double precision not null,
  max_drawdown double precision not null,
  profit_factor double precision not null,
  win_rate double precision not null,
  expectancy double precision not null,
  by_regime jsonb not null,
  attribution_hash text not null,
  created_at timestamptz not null default now(),
  unique(strategy_id, as_of_ts, attribution_hash)
);
create index if not exists idx_strategy_perf_strategy_asof on trading_strategy_performance_snapshots(strategy_id, as_of_ts desc);

alter table trading_runtime_snapshots add column if not exists post_trade jsonb;

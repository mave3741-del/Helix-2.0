create table if not exists trading_closed_loop_cycles (
  cycle_id text primary key,
  as_of_ts timestamptz not null,
  champion_strategy_id text,
  challenger_strategy_ids jsonb not null default '[]'::jsonb,
  allocations jsonb not null default '[]'::jsonb,
  attribution jsonb not null default '[]'::jsonb,
  decisions jsonb not null default '[]'::jsonb,
  fail_closed boolean not null default false,
  reasons jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists trading_closed_loop_cycles_ts_idx on trading_closed_loop_cycles(as_of_ts desc);

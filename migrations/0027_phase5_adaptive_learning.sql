create table if not exists trading_phase5_learning_cycles (
  cycle_id text primary key,
  strategy_adaptation jsonb not null,
  allocations jsonb not null,
  champion_rotation jsonb not null,
  execution_throttle jsonb not null,
  fail_closed boolean not null,
  reasons jsonb not null,
  decision_hash text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists trading_execution_quality_feedback (
  feedback_id text primary key,
  strategy_id text not null,
  symbol text not null,
  implementation_shortfall_bps double precision not null,
  fee_bps double precision not null,
  slippage_bps double precision not null,
  fill_rate double precision not null,
  quality_score double precision not null,
  execution_adjustment double precision not null,
  action text not null check (action in ('improve','maintain','throttle')),
  created_at timestamptz not null default now()
);

create index if not exists trading_phase5_learning_created_idx on trading_phase5_learning_cycles(created_at desc);
create index if not exists trading_execution_quality_strategy_idx on trading_execution_quality_feedback(strategy_id, symbol, created_at desc);

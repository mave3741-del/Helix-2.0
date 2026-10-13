create table if not exists trading_agent_decision_ledger (
  decision_id text primary key,
  agent_id text not null,
  decision_type text not null,
  symbol text,
  strategy_id text,
  as_of_ts timestamptz not null,
  evidence_ids jsonb not null default '[]'::jsonb,
  model jsonb,
  rationale text,
  confidence double precision not null,
  decision_hash text not null,
  outcome jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists trading_agent_decision_ledger_agent_idx on trading_agent_decision_ledger(agent_id, created_at desc);
create index if not exists trading_agent_decision_ledger_symbol_idx on trading_agent_decision_ledger(symbol, as_of_ts desc);

create table if not exists trading_execution_attribution (
  execution_id text primary key,
  decision_id text,
  strategy_id text,
  symbol text not null,
  venue text,
  side text not null,
  requested_qty double precision not null,
  filled_qty double precision not null,
  benchmark_price double precision not null,
  avg_fill_price double precision,
  slippage_bps double precision,
  fee double precision not null default 0,
  partial_fill boolean not null default false,
  execution_quality double precision,
  as_of_ts timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists trading_execution_attribution_strategy_idx on trading_execution_attribution(strategy_id, created_at desc);
create index if not exists trading_execution_attribution_symbol_idx on trading_execution_attribution(symbol, created_at desc);

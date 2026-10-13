create table if not exists trading_strategy_outcomes (
  outcome_id text primary key,
  strategy_id text not null,
  decision_id text,
  symbol text not null,
  regime text,
  pnl double precision not null,
  max_favorable_excursion double precision,
  max_adverse_excursion double precision,
  execution_cost double precision not null default 0,
  source text not null,
  as_of_ts timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists trading_strategy_outcomes_strategy_idx on trading_strategy_outcomes(strategy_id, as_of_ts desc);
create index if not exists trading_strategy_outcomes_decision_idx on trading_strategy_outcomes(decision_id, created_at desc);

create table if not exists trading_champion_challenger_runs (
  run_id text primary key,
  champion_strategy_id text not null,
  challenger_strategy_id text not null,
  score_delta double precision not null,
  pnl_delta double precision not null,
  promoted boolean not null,
  reasons jsonb not null default '[]'::jsonb,
  as_of_ts timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists trading_champion_challenger_created_idx on trading_champion_challenger_runs(created_at desc);

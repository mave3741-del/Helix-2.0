create table if not exists trading_portfolio_governance_runs (
  run_id text primary key,
  cycle_id text not null references trading_closed_loop_cycles(cycle_id) on delete restrict,
  status text not null check (status in ('eligible','fail_closed','retired')),
  allocations jsonb not null default '[]'::jsonb,
  as_of_ts timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists trading_portfolio_governance_runs_cycle_idx on trading_portfolio_governance_runs(cycle_id, as_of_ts desc);

create table if not exists trading_champion_portfolio_reconciliations (
  reconciliation_id text primary key,
  cycle_id text not null,
  as_of_ts timestamptz not null,
  champion_strategy_id text,
  portfolio_strategy_ids jsonb not null default '[]'::jsonb,
  closed_loop_decision_hash text,
  champion_decision_hash text,
  governance_run_id text,
  status text not null check (status in ('reconciled','fail_closed')),
  reasons jsonb not null default '[]'::jsonb,
  decision_hash text not null,
  created_at timestamptz not null default now()
);
create unique index if not exists trading_champion_portfolio_reconciliations_hash_idx
  on trading_champion_portfolio_reconciliations(decision_hash);
create index if not exists trading_champion_portfolio_reconciliations_cycle_idx
  on trading_champion_portfolio_reconciliations(cycle_id, as_of_ts desc);

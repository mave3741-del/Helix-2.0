create table if not exists trading_cycle_health_audits (
  cycle_id text primary key references trading_closed_loop_cycles(cycle_id) on delete restrict,
  as_of_ts timestamptz not null default now(),
  status text not null check (status in ('healthy','degraded','halted')),
  score double precision not null check (score >= 0 and score <= 1),
  reasons jsonb not null,
  decision_hash text not null unique,
  reconciliation_hash text
);

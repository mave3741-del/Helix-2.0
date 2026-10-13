create table if not exists trading_phase7_paper_canary_cohorts (
  cohort_id text primary key,
  state text not null,
  snapshot jsonb not null,
  snapshot_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (state in ('blocked','admitted','qualified'))
);

create index if not exists trading_phase7_paper_canary_cohorts_state_idx
  on trading_phase7_paper_canary_cohorts(state, updated_at desc);

create table if not exists trading_phase7_paper_canary_observations (
  observation_id text primary key,
  cohort_id text not null references trading_phase7_paper_canary_cohorts(cohort_id) on delete cascade,
  cycle_id text not null,
  session_id text not null,
  observed_at timestamptz not null,
  observation jsonb not null,
  created_at timestamptz not null default now(),
  unique (cohort_id, cycle_id)
);

create index if not exists trading_phase7_paper_canary_observations_idx
  on trading_phase7_paper_canary_observations(cohort_id, observed_at asc, cycle_id asc);

create table if not exists trading_phase7_paper_canary_comparisons (
  comparison_id text primary key,
  comparison jsonb not null,
  evidence_hash text not null,
  created_at timestamptz not null default now()
);

create index if not exists trading_phase7_paper_canary_comparisons_created_idx
  on trading_phase7_paper_canary_comparisons(created_at desc);

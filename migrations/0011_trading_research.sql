-- Immutable research experiment lineage and evaluation results.
create table if not exists trading_research_experiments (
  experiment_id text primary key,
  strategy_id text not null,
  parent_experiment_id text,
  stage text not null check (stage in ('research','backtest','out_of_sample','walk_forward','paper','promoted','retired')),
  spec jsonb not null,
  spec_hash text not null,
  created_at timestamptz not null default current_timestamp,
  finalized_at timestamptz
);

create index if not exists trading_research_experiments_strategy_idx
  on trading_research_experiments (strategy_id, created_at desc);

create table if not exists trading_research_evaluations (
  evaluation_id text primary key,
  experiment_id text not null references trading_research_experiments(experiment_id) on delete cascade,
  phase text not null check (phase in ('in_sample','out_of_sample','walk_forward','paper')),
  window_start bigint not null,
  window_end bigint not null,
  metrics jsonb not null,
  passed boolean not null,
  result_hash text not null,
  created_at timestamptz not null default current_timestamp,
  unique (experiment_id, evaluation_id)
);

create index if not exists trading_research_evaluations_experiment_idx
  on trading_research_evaluations (experiment_id, phase, window_start, window_end);

create table if not exists trading_worker_reasoning (
  reason_id text primary key,
  task_id text not null,
  worker_id text not null,
  task_type text not null,
  provider text not null,
  model_id text not null,
  policy_version text not null,
  input_hash text not null,
  output_hash text not null,
  trace jsonb not null,
  created_at timestamptz not null default current_timestamp
);

create index if not exists trading_worker_reasoning_task_idx
  on trading_worker_reasoning (task_id, created_at desc);
create index if not exists trading_worker_reasoning_worker_idx
  on trading_worker_reasoning (worker_id, created_at desc);

-- Persistent trading worker identity and runtime state.
create table if not exists trading_worker_registry (
  worker_id text primary key,
  registry_id text not null unique,
  worker_number integer not null unique check (worker_number between 1 and 1000),
  specialization_id text not null,
  specialization_name text not null,
  family text not null,
  markets jsonb not null,
  methods jsonb not null,
  capabilities jsonb not null,
  focus text not null,
  status text not null default 'available'
    check (status in ('available', 'busy', 'suspended', 'disabled')),
  model_id text not null,
  policy_version text not null,
  workload integer not null default 0,
  heartbeat_at timestamptz,
  last_task_id text,
  completed_tasks integer not null default 0,
  failed_tasks integer not null default 0,
  total_latency_ms bigint not null default 0,
  total_tokens bigint not null default 0,
  last_error text,
  created_at timestamptz not null default current_timestamp,
  updated_at timestamptz not null default current_timestamp
);

create index if not exists trading_worker_registry_family_idx
  on trading_worker_registry (family, status, workload);
create index if not exists trading_worker_registry_status_idx
  on trading_worker_registry (status, workload, worker_number);

-- Every completed/failed execution gets one immutable provenance record.
create table if not exists trading_task_results (
  result_id text primary key,
  task_id text not null,
  worker_id text not null,
  attempt_count integer not null,
  ok boolean not null,
  started_at timestamptz not null,
  completed_at timestamptz not null,
  duration_ms integer not null check (duration_ms >= 0),
  output jsonb not null,
  provenance jsonb not null,
  provenance_hash text not null,
  created_at timestamptz not null default current_timestamp,
  unique (task_id, attempt_count)
);

create index if not exists trading_task_results_task_idx
  on trading_task_results (task_id, attempt_count);
create index if not exists trading_task_results_worker_idx
  on trading_task_results (worker_id, completed_at desc);
create index if not exists trading_task_results_provenance_idx
  on trading_task_results (provenance_hash);

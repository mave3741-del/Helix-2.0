-- Durable worker/task queue for the server-side trading organization.
-- Tasks are leased, heartbeated, retried, and recoverable after worker crashes.

create table if not exists trading_task_queue (
  task_id text primary key,
  task_type text not null,
  payload jsonb not null,
  status text not null default 'queued'
    check (status in ('queued', 'running', 'completed', 'failed', 'dead_letter')),
  priority integer not null default 0,
  available_at timestamptz not null default current_timestamp,
  attempt_count integer not null default 0,
  max_attempts integer not null default 5,
  worker_id text,
  lease_until timestamptz,
  heartbeat_at timestamptz,
  last_error text,
  created_at timestamptz not null default current_timestamp,
  updated_at timestamptz not null default current_timestamp,
  completed_at timestamptz
);

create index if not exists trading_task_queue_claim_idx
  on trading_task_queue (status, available_at, priority desc, created_at, task_id);
create index if not exists trading_task_queue_lease_idx
  on trading_task_queue (status, lease_until);
create index if not exists trading_task_queue_type_idx
  on trading_task_queue (task_type, status, created_at);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'trading_task_queue_max_attempts_positive'
  ) then
    alter table trading_task_queue
      add constraint trading_task_queue_max_attempts_positive check (max_attempts > 0);
  end if;
end $$;

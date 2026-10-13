create table if not exists trading_phase7_paper_operation_sessions (
  session_id text primary key,
  state text not null,
  snapshot jsonb not null,
  snapshot_hash text not null,
  recovery_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (state in ('planned','armed','running','paused','rollback','completed','aborted')),
  check (recovery_count >= 0)
);

create index if not exists trading_phase7_paper_operation_sessions_state_idx
  on trading_phase7_paper_operation_sessions(state, updated_at desc);

create table if not exists trading_runtime_snapshots (
  snapshot_id bigint generated always as identity primary key,
  runtime_id text not null,
  schema_version integer not null check (schema_version >= 1),
  saved_at timestamptz not null,
  runtime_state jsonb not null,
  paper_state jsonb not null,
  event_cursor jsonb,
  created_at timestamptz not null default current_timestamp
);

create index if not exists trading_runtime_snapshots_latest_idx
  on trading_runtime_snapshots (runtime_id, snapshot_id desc);

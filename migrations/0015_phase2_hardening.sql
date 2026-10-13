create table if not exists trading_phase2_execution_audit (
  audit_id text primary key,
  scan_id text not null,
  symbol text not null,
  stage text not null,
  ok boolean not null,
  reasons jsonb not null default '[]'::jsonb,
  worker_id text,
  task_id text,
  result_id text,
  as_of_ts timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists trading_phase2_execution_audit_scan_idx on trading_phase2_execution_audit(scan_id, created_at desc);
create index if not exists trading_phase2_execution_audit_symbol_idx on trading_phase2_execution_audit(symbol, created_at desc);

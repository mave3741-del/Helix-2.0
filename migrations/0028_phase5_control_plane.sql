create table if not exists trading_phase5_audit_ledger (
  cycle_id text primary key,
  decision_hash text not null,
  previous_hash text,
  entry_hash text not null unique,
  created_at timestamptz not null default now()
);

create index if not exists trading_phase5_audit_created_idx on trading_phase5_audit_ledger(created_at desc);

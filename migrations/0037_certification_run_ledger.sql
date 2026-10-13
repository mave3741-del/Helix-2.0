create table if not exists trading_certification_run_ledger (
  run_id text primary key,
  schema_version integer not null,
  gate text not null,
  generated_at timestamptz not null,
  package_version text not null,
  package_json_sha256 text not null,
  package_lock_sha256 text not null,
  source_tree_sha256 text not null,
  source_file_count integer not null check (source_file_count >= 0),
  node_version text not null,
  npm_version text not null,
  platform text not null,
  evidence_present boolean not null,
  evidence_sha256 text,
  preflight_present boolean not null,
  preflight_sha256 text,
  live_execution_disabled boolean not null,
  external_certification_pass boolean not null,
  status text not null check (status in ('PENDING_EXTERNAL_PASS','PASS','FAIL')),
  record_hash text not null unique,
  created_at timestamptz not null default now()
);

create or replace function deny_certification_ledger_mutation() returns trigger
language plpgsql as $$
begin
  raise exception 'certification_run_ledger_append_only';
end;
$$;

drop trigger if exists trg_certification_run_ledger_immutable on trading_certification_run_ledger;
create trigger trg_certification_run_ledger_immutable
before update or delete on trading_certification_run_ledger
for each row execute function deny_certification_ledger_mutation();

create table if not exists trading_native_tool_registry (
  tool_id text primary key,
  name text not null,
  description text not null,
  category text not null check (category in ('trading','research','data','risk')),
  input_schema jsonb not null,
  output_schema jsonb not null,
  version text not null,
  implementation text not null check (implementation = 'native'),
  sandboxed boolean not null check (sandboxed = true),
  credentials_allowed boolean not null check (credentials_allowed = false),
  wallet_access boolean not null check (wallet_access = false),
  lifecycle text not null check (lifecycle in ('proposed','tested','approved','deployed','retired')),
  schema_hash text not null,
  implementation_hash text not null,
  provenance text not null,
  updated_at timestamptz not null default now()
);

create index if not exists trading_native_tool_registry_lifecycle_idx
  on trading_native_tool_registry(lifecycle, updated_at desc);

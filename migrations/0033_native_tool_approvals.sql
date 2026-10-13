create table if not exists trading_native_tool_approvals (
  approval_id text primary key,
  tool_id text not null references trading_native_tool_registry(tool_id),
  action text not null check (action in ('approve','deploy','reject')),
  from_lifecycle text not null check (from_lifecycle in ('proposed','tested','approved','deployed','retired')),
  to_lifecycle text not null check (to_lifecycle in ('proposed','tested','approved','deployed','retired')),
  reviewer text not null,
  implementer text not null,
  conflict_declared boolean not null check (conflict_declared = true),
  evidence_ids jsonb not null,
  evidence_hash text not null,
  reason text not null,
  tool_schema_hash text not null,
  tool_implementation_hash text not null,
  created_at timestamptz not null default now(),
  check (reviewer <> implementer),
  check (jsonb_typeof(evidence_ids) = 'array')
);

create index if not exists trading_native_tool_approvals_tool_idx
  on trading_native_tool_approvals(tool_id, created_at asc);

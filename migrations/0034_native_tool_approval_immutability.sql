alter table trading_native_tool_approvals
  add column if not exists expires_at timestamptz not null default (now() + interval '30 days'),
  add column if not exists decision_hash text not null default '';

create or replace function trading_native_tool_approvals_immutable()
returns trigger
language plpgsql
as $$
begin
  raise exception 'trading_native_tool_approvals_append_only';
end;
$$;

drop trigger if exists trading_native_tool_approvals_immutable_update on trading_native_tool_approvals;
create trigger trading_native_tool_approvals_immutable_update
before update or delete on trading_native_tool_approvals
for each row execute function trading_native_tool_approvals_immutable();

alter table trading_native_tool_approvals
  add constraint trading_native_tool_approvals_expiry_check check (expires_at > created_at);

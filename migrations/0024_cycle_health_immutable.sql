create or replace function trading_reject_cycle_health_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'cycle_health_audit_append_only:%', TG_OP using errcode = '55000';
end;
$$;

drop trigger if exists trading_cycle_health_audits_immutable_trg on trading_cycle_health_audits;
create trigger trading_cycle_health_audits_immutable_trg
before update or delete on trading_cycle_health_audits
for each row execute function trading_reject_cycle_health_mutation();

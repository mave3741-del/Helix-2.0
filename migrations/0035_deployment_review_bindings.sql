create table if not exists trading_deployment_review_bindings (
  binding_id text primary key,
  decision_hash text not null,
  deployment_id text not null,
  app_version text not null,
  attestation_hash text not null,
  reviewer text not null,
  implementer text not null,
  decision_action text not null check (decision_action in ('approve','deploy')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  binding_hash text not null,
  check (reviewer <> implementer),
  check (expires_at > created_at)
);

create unique index if not exists trading_deployment_review_bindings_decision_idx
  on trading_deployment_review_bindings(decision_hash, deployment_id);

create or replace function trading_deployment_review_bindings_immutable()
returns trigger
language plpgsql
as $$
begin
  raise exception 'trading_deployment_review_bindings_append_only';
end;
$$;

drop trigger if exists trading_deployment_review_bindings_immutable on trading_deployment_review_bindings;
create trigger trading_deployment_review_bindings_immutable
before update or delete on trading_deployment_review_bindings
for each row execute function trading_deployment_review_bindings_immutable();

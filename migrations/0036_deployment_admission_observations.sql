create table if not exists trading_deployment_admission_observations (
  observation_id text primary key,
  request_id text not null,
  deployment_id text not null,
  app_version text not null,
  allowed boolean not null,
  reasons jsonb not null,
  binding_id text,
  binding_hash text,
  attestation_hash text not null,
  evaluated_at timestamptz not null default now(),
  observation_hash text not null,
  check (jsonb_typeof(reasons) = 'array'),
  check (length(attestation_hash) = 64),
  check (length(observation_hash) = 64),
  check (binding_hash is null or length(binding_hash) = 64)
);

create unique index if not exists trading_deployment_admission_observations_request_idx
  on trading_deployment_admission_observations(request_id);

create index if not exists trading_deployment_admission_observations_deployment_idx
  on trading_deployment_admission_observations(deployment_id, evaluated_at);

create or replace function trading_deployment_admission_observations_immutable()
returns trigger
language plpgsql
as $$
begin
  raise exception 'trading_deployment_admission_observations_append_only';
end;
$$;

drop trigger if exists trading_deployment_admission_observations_immutable on trading_deployment_admission_observations;
create trigger trading_deployment_admission_observations_immutable
before update or delete on trading_deployment_admission_observations
for each row execute function trading_deployment_admission_observations_immutable();

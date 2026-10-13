create table if not exists rl_lifecycle_drift_events (event_id bigserial primary key, champion_id text not null, baseline_hash text not null, current_hash text not null, degradation_rate numeric not null, decision text not null, evidence_hash text not null unique, created_at timestamptz not null default now());
create or replace function helix_rl_lifecycle_drift_immutable() returns trigger language plpgsql as $$ begin raise exception 'rl_lifecycle_drift_append_only'; end $$;
drop trigger if exists rl_lifecycle_drift_no_update on rl_lifecycle_drift_events; drop trigger if exists rl_lifecycle_drift_no_delete on rl_lifecycle_drift_events;
create trigger rl_lifecycle_drift_no_update before update on rl_lifecycle_drift_events for each row execute function helix_rl_lifecycle_drift_immutable();
create trigger rl_lifecycle_drift_no_delete before delete on rl_lifecycle_drift_events for each row execute function helix_rl_lifecycle_drift_immutable();

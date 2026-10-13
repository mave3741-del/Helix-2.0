create table if not exists rl_lifecycle_emergency_stops (stop_id bigserial primary key, active boolean not null, reason text not null, source text not null, activated_at timestamptz not null, evidence_hash text not null unique);
create or replace function helix_rl_emergency_stop_immutable() returns trigger language plpgsql as $$ begin raise exception 'rl_emergency_stop_append_only'; end $$;
drop trigger if exists rl_emergency_stop_no_update on rl_lifecycle_emergency_stops; drop trigger if exists rl_emergency_stop_no_delete on rl_lifecycle_emergency_stops;
create trigger rl_emergency_stop_no_update before update on rl_lifecycle_emergency_stops for each row execute function helix_rl_emergency_stop_immutable();
create trigger rl_emergency_stop_no_delete before delete on rl_lifecycle_emergency_stops for each row execute function helix_rl_emergency_stop_immutable();

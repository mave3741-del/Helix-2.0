create table if not exists rl_lifecycle_recovery (sequence bigint primary key, state text not null, champion_id text, challenger_id text, previous_hash text, lifecycle_hash text not null unique, created_at timestamptz not null default now());
create or replace function helix_rl_lifecycle_recovery_immutable() returns trigger language plpgsql as $$ begin raise exception 'rl_lifecycle_recovery_append_only'; end $$;
drop trigger if exists rl_lifecycle_recovery_no_update on rl_lifecycle_recovery;
drop trigger if exists rl_lifecycle_recovery_no_delete on rl_lifecycle_recovery;
create trigger rl_lifecycle_recovery_no_update before update on rl_lifecycle_recovery for each row execute function helix_rl_lifecycle_recovery_immutable();
create trigger rl_lifecycle_recovery_no_delete before delete on rl_lifecycle_recovery for each row execute function helix_rl_lifecycle_recovery_immutable();

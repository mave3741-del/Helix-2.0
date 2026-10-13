create table if not exists rl_lifecycle_audit_bundles (bundle_id bigserial primary key, lifecycle_hash text not null, recovery_hash text not null, drift_hash text not null, stop_hash text, bundle_hash text not null unique, created_at timestamptz not null default now());
create or replace function helix_rl_audit_bundle_immutable() returns trigger language plpgsql as $$ begin raise exception 'rl_audit_bundle_append_only'; end $$;
drop trigger if exists rl_rl_audit_bundle_no_update on rl_lifecycle_audit_bundles; drop trigger if exists rl_rl_audit_bundle_no_delete on rl_lifecycle_audit_bundles;
create trigger rl_rl_audit_bundle_no_update before update on rl_lifecycle_audit_bundles for each row execute function helix_rl_audit_bundle_immutable();
create trigger rl_rl_audit_bundle_no_delete before delete on rl_lifecycle_audit_bundles for each row execute function helix_rl_audit_bundle_immutable();

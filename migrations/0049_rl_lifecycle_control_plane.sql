-- HELIX Phase 10.8.10: unified RL lifecycle control-plane evidence.
CREATE TABLE IF NOT EXISTS rl_lifecycle_control_audit (
  id BIGSERIAL PRIMARY KEY,
  champion_id TEXT NOT NULL,
  challenger_id TEXT,
  decision TEXT NOT NULL CHECK (decision IN ('promote','retain','rollback','hold')),
  champion_schedule_hash TEXT NOT NULL CHECK (champion_schedule_hash ~ '^[a-fA-F0-9]{64}$'),
  challenger_schedule_hash TEXT NOT NULL CHECK (challenger_schedule_hash ~ '^[a-fA-F0-9]{64}$'),
  reassessment_hash TEXT NOT NULL CHECK (reassessment_hash ~ '^[a-fA-F0-9]{64}$'),
  candidate_id TEXT,
  promotion_ledger_hash TEXT,
  challenger_ledger_hash TEXT,
  deterministic_hash TEXT NOT NULL CHECK (deterministic_hash ~ '^[a-fA-F0-9]{64}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS rl_lifecycle_control_audit_hash_uq ON rl_lifecycle_control_audit(deterministic_hash);
CREATE OR REPLACE FUNCTION prevent_rl_lifecycle_control_mutation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'rl_lifecycle_control_audit_append_only'; END $$;
DROP TRIGGER IF EXISTS rl_lifecycle_control_audit_no_update ON rl_lifecycle_control_audit;
CREATE TRIGGER rl_lifecycle_control_audit_no_update BEFORE UPDATE OR DELETE ON rl_lifecycle_control_audit FOR EACH ROW EXECUTE FUNCTION prevent_rl_lifecycle_control_mutation();

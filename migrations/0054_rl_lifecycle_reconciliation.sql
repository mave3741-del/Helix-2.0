CREATE TABLE IF NOT EXISTS rl_lifecycle_reconciliation (
  id BIGSERIAL PRIMARY KEY, sequence BIGINT NOT NULL, state TEXT NOT NULL, lifecycle_hash TEXT NOT NULL, previous_hash TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(sequence)
);
CREATE OR REPLACE FUNCTION reject_rl_reconciliation_mutation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'rl_lifecycle_reconciliation_append_only'; END; $$;
DROP TRIGGER IF EXISTS rl_lifecycle_reconciliation_no_update ON rl_lifecycle_reconciliation;
CREATE TRIGGER rl_lifecycle_reconciliation_no_update BEFORE UPDATE OR DELETE ON rl_lifecycle_reconciliation FOR EACH ROW EXECUTE FUNCTION reject_rl_reconciliation_mutation();

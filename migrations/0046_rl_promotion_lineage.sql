CREATE TABLE IF NOT EXISTS rl_promotion_lineage (
  lineage_id TEXT PRIMARY KEY,
  candidate_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('champion','challenger')),
  decision TEXT NOT NULL CHECK (decision IN ('promoted','rejected','rolled_back')),
  previous_champion_id TEXT,
  previous_challenger_id TEXT,
  replacement_candidate_id TEXT,
  source_ledger_entry_hash TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  previous_event_hash TEXT,
  event_hash TEXT NOT NULL UNIQUE
);
CREATE INDEX IF NOT EXISTS rl_promotion_lineage_candidate_idx ON rl_promotion_lineage(candidate_id);
CREATE INDEX IF NOT EXISTS rl_promotion_lineage_role_decision_idx ON rl_promotion_lineage(role, decision);
CREATE OR REPLACE FUNCTION reject_rl_promotion_lineage_mutation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'rl_promotion_lineage_append_only'; END; $$;
DROP TRIGGER IF EXISTS rl_promotion_lineage_no_update ON rl_promotion_lineage;
CREATE TRIGGER rl_promotion_lineage_no_update BEFORE UPDATE ON rl_promotion_lineage FOR EACH ROW EXECUTE FUNCTION reject_rl_promotion_lineage_mutation();
DROP TRIGGER IF EXISTS rl_promotion_lineage_no_delete ON rl_promotion_lineage;
CREATE TRIGGER rl_promotion_lineage_no_delete BEFORE DELETE ON rl_promotion_lineage FOR EACH ROW EXECUTE FUNCTION reject_rl_promotion_lineage_mutation();

CREATE TABLE IF NOT EXISTS rl_continuous_reassessment (
  reassessment_id TEXT PRIMARY KEY,
  champion_id TEXT NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('retain','rollback')),
  reasons_json TEXT NOT NULL,
  stress_pass_rate DOUBLE PRECISION NOT NULL,
  seed_robustness_rate DOUBLE PRECISION NOT NULL,
  worst_drawdown DOUBLE PRECISION,
  baseline_evidence_hash TEXT NOT NULL,
  deterministic_hash TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS rl_continuous_reassessment_champion_idx ON rl_continuous_reassessment(champion_id, created_at);
CREATE OR REPLACE FUNCTION reject_rl_continuous_reassessment_mutation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'rl_continuous_reassessment_append_only'; END; $$;
DROP TRIGGER IF EXISTS rl_continuous_reassessment_no_update ON rl_continuous_reassessment;
CREATE TRIGGER rl_continuous_reassessment_no_update BEFORE UPDATE ON rl_continuous_reassessment FOR EACH ROW EXECUTE FUNCTION reject_rl_continuous_reassessment_mutation();
DROP TRIGGER IF EXISTS rl_continuous_reassessment_no_delete ON rl_continuous_reassessment;
CREATE TRIGGER rl_continuous_reassessment_no_delete BEFORE DELETE ON rl_continuous_reassessment FOR EACH ROW EXECUTE FUNCTION reject_rl_continuous_reassessment_mutation();

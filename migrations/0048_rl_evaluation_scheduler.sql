-- HELIX Phase 10.8.9: RL evaluation scheduler governance.
CREATE TABLE IF NOT EXISTS rl_evaluation_schedule_audit (
  id BIGSERIAL PRIMARY KEY,
  subject_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('champion','challenger')),
  evaluated_at BIGINT NOT NULL,
  cadence_ms BIGINT NOT NULL CHECK (cadence_ms > 0),
  freshness_ms BIGINT NOT NULL CHECK (freshness_ms >= 0),
  grace_ms BIGINT NOT NULL DEFAULT 0 CHECK (grace_ms >= 0),
  due BOOLEAN NOT NULL,
  missed BOOLEAN NOT NULL,
  evidence_fresh BOOLEAN NOT NULL,
  eligible BOOLEAN NOT NULL,
  evidence_hash TEXT,
  deterministic_hash TEXT NOT NULL CHECK (deterministic_hash ~ '^[a-fA-F0-9]{64}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS rl_evaluation_schedule_audit_hash_uq
  ON rl_evaluation_schedule_audit(deterministic_hash);

CREATE OR REPLACE FUNCTION prevent_rl_evaluation_schedule_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'rl_evaluation_schedule_audit_append_only';
END $$;

DROP TRIGGER IF EXISTS rl_evaluation_schedule_audit_no_update ON rl_evaluation_schedule_audit;
CREATE TRIGGER rl_evaluation_schedule_audit_no_update
BEFORE UPDATE OR DELETE ON rl_evaluation_schedule_audit
FOR EACH ROW EXECUTE FUNCTION prevent_rl_evaluation_schedule_mutation();

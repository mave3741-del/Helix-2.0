CREATE TABLE IF NOT EXISTS rl_promotion_ledger (
  candidate_id TEXT PRIMARY KEY,
  experiment_id TEXT NOT NULL,
  environment_hash TEXT NOT NULL,
  algorithm TEXT NOT NULL,
  seeds JSONB NOT NULL,
  config_hash TEXT NOT NULL,
  evidence JSONB NOT NULL,
  gate_eligible BOOLEAN NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('promoted','rejected')),
  rejection_reasons JSONB NOT NULL DEFAULT '[]'::jsonb,
  previous_hash TEXT,
  entry_hash TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT rl_promotion_decision_consistency CHECK ((gate_eligible AND decision = 'promoted') OR (NOT gate_eligible AND decision = 'rejected'))
);
CREATE UNIQUE INDEX IF NOT EXISTS rl_promotion_experiment_candidate_uq ON rl_promotion_ledger (experiment_id, candidate_id);
CREATE INDEX IF NOT EXISTS rl_promotion_decision_idx ON rl_promotion_ledger (decision);

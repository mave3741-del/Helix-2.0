CREATE TABLE IF NOT EXISTS rl_governance_decisions (
  id BIGSERIAL PRIMARY KEY, decision TEXT NOT NULL, candidate_id TEXT, approval_required BOOLEAN NOT NULL, approval_granted BOOLEAN NOT NULL, evidence_complete BOOLEAN NOT NULL, evidence_fresh BOOLEAN NOT NULL, deterministic_hash TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(deterministic_hash)
);

CREATE TABLE IF NOT EXISTS rl_champion_drift_observations (
  id BIGSERIAL PRIMARY KEY, champion_id TEXT NOT NULL, baseline_hash TEXT NOT NULL, current_hash TEXT NOT NULL, degradation_rate DOUBLE PRECISION NOT NULL, decision TEXT NOT NULL, evidence_hash TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS rl_champion_drift_observations_evidence_uq ON rl_champion_drift_observations(evidence_hash);

CREATE TABLE IF NOT EXISTS external_intelligence_registry (
  evidence_id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('news','social','filing','macro')),
  subject_id TEXT NOT NULL,
  canonical_url TEXT,
  event_ts TIMESTAMPTZ NOT NULL,
  published_ts TIMESTAMPTZ,
  available_ts TIMESTAMPTZ NOT NULL,
  retrieved_ts TIMESTAMPTZ NOT NULL,
  symbols JSONB NOT NULL DEFAULT '[]'::jsonb,
  entities JSONB NOT NULL DEFAULT '[]'::jsonb,
  sentiment_score DOUBLE PRECISION,
  sentiment_label TEXT,
  credibility_score DOUBLE PRECISION NOT NULL CHECK (credibility_score BETWEEN 0 AND 1),
  manipulation_risk DOUBLE PRECISION NOT NULL CHECK (manipulation_risk BETWEEN 0 AND 1),
  duplicate_key TEXT NOT NULL,
  provenance JSONB NOT NULL,
  evidence_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS external_intelligence_registry_duplicate_uq
  ON external_intelligence_registry (duplicate_key);
CREATE INDEX IF NOT EXISTS external_intelligence_registry_source_ts_idx
  ON external_intelligence_registry (source_id, event_ts DESC);
CREATE INDEX IF NOT EXISTS external_intelligence_registry_subject_ts_idx
  ON external_intelligence_registry (subject_id, event_ts DESC);

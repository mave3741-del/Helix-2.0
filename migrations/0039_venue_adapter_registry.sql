CREATE TABLE IF NOT EXISTS venue_adapter_registry (
  adapter_id TEXT PRIMARY KEY,
  venue_id TEXT NOT NULL,
  source_repository TEXT,
  source_version TEXT,
  adapter_version TEXT NOT NULL,
  capability TEXT NOT NULL,
  implementation_kind TEXT NOT NULL CHECK (implementation_kind IN ('native','adapter','reference','reimplementation')),
  status TEXT NOT NULL CHECK (status IN ('proposed','assessed','approved','deployed','rejected','retired')),
  execution_modes JSONB NOT NULL DEFAULT '["paper"]'::jsonb,
  live_execution_enabled BOOLEAN NOT NULL DEFAULT FALSE CHECK (live_execution_enabled = FALSE),
  capabilities JSONB NOT NULL,
  evidence JSONB NOT NULL,
  provenance TEXT NOT NULL,
  implementation_hash TEXT NOT NULL,
  evidence_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS venue_adapter_registry_venue_version_uq
  ON venue_adapter_registry (venue_id, adapter_version);

CREATE INDEX IF NOT EXISTS venue_adapter_registry_status_idx
  ON venue_adapter_registry (status);

CREATE TABLE IF NOT EXISTS capability_integration_registry (
  integration_id TEXT PRIMARY KEY,
  benchmark_id TEXT NOT NULL,
  source_repository TEXT NOT NULL,
  source_version TEXT NOT NULL,
  capability TEXT NOT NULL,
  treatment TEXT NOT NULL CHECK (treatment IN ('reference','adapter','optional-component','reimplement','core-component')),
  component_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('proposed','assessed','approved','deployed','rejected','retired')),
  core_dependency_allowed BOOLEAN NOT NULL DEFAULT FALSE,
  evidence JSONB NOT NULL,
  provenance TEXT NOT NULL,
  implementation_hash TEXT NOT NULL,
  evidence_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS capability_integration_registry_source_component_uq
  ON capability_integration_registry (source_repository, source_version, component_name);

CREATE INDEX IF NOT EXISTS capability_integration_registry_status_idx
  ON capability_integration_registry (status);

CREATE TABLE IF NOT EXISTS rl_lifecycle_certification (
  id BIGSERIAL PRIMARY KEY, certification_hash TEXT NOT NULL UNIQUE, test_count INTEGER NOT NULL, passed_count INTEGER NOT NULL, migration_count INTEGER NOT NULL, live_execution_enabled BOOLEAN NOT NULL DEFAULT FALSE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

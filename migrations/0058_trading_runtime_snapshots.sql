CREATE TABLE IF NOT EXISTS trading_runtime_snapshots (
  snapshot_id BIGSERIAL PRIMARY KEY, runtime_id TEXT NOT NULL, schema_version INTEGER NOT NULL, saved_at TIMESTAMPTZ NOT NULL, runtime_state JSONB NOT NULL, paper_state JSONB NOT NULL, event_cursor JSONB, post_trade JSONB
);
CREATE INDEX IF NOT EXISTS trading_runtime_snapshots_runtime_id_idx ON trading_runtime_snapshots (runtime_id, snapshot_id DESC);

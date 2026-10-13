CREATE TABLE IF NOT EXISTS crypto_strategy_capability_registry (
  capability_id TEXT PRIMARY KEY,
  strategy_id TEXT NOT NULL,
  strategy_kind TEXT NOT NULL CHECK (strategy_kind IN ('market-making','arbitrage','trend','mean-reversion')),
  research_mode TEXT NOT NULL CHECK (research_mode IN ('dry-run','paper')),
  optimization_mode TEXT NOT NULL CHECK (optimization_mode IN ('bounded-grid','bounded-random','none')),
  venue_adapter_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  symbols JSONB NOT NULL DEFAULT '[]'::jsonb,
  parameter_bounds JSONB NOT NULL DEFAULT '[]'::jsonb,
  max_concurrent_positions INTEGER NOT NULL CHECK (max_concurrent_positions > 0),
  max_notional_per_position DOUBLE PRECISION NOT NULL CHECK (max_notional_per_position > 0),
  max_daily_loss DOUBLE PRECISION NOT NULL CHECK (max_daily_loss > 0),
  live_execution_enabled BOOLEAN NOT NULL DEFAULT FALSE CHECK (live_execution_enabled = FALSE),
  status TEXT NOT NULL CHECK (status IN ('proposed','assessed','approved','deployed','retired','rejected')),
  evidence JSONB NOT NULL,
  provenance TEXT NOT NULL,
  implementation_hash TEXT NOT NULL,
  evidence_hash TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS crypto_strategy_capability_registry_strategy_uq
  ON crypto_strategy_capability_registry (strategy_id);
CREATE INDEX IF NOT EXISTS crypto_strategy_capability_registry_status_idx
  ON crypto_strategy_capability_registry (status);

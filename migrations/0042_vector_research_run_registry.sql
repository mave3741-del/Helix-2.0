CREATE TABLE IF NOT EXISTS vector_research_run_registry (
  run_id TEXT PRIMARY KEY,
  strategy_id TEXT NOT NULL,
  stage TEXT NOT NULL CHECK (stage IN ('in_sample','out_of_sample','walk_forward','paper')),
  candidate_count INTEGER NOT NULL CHECK (candidate_count > 0),
  evaluated_count INTEGER NOT NULL CHECK (evaluated_count >= 0 AND evaluated_count <= candidate_count),
  max_candidates INTEGER NOT NULL CHECK (max_candidates > 0),
  selected_candidate_id TEXT,
  input_hash TEXT NOT NULL,
  result_hash TEXT NOT NULL,
  live_execution_enabled BOOLEAN NOT NULL DEFAULT FALSE CHECK (live_execution_enabled = FALSE),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS vector_research_run_registry_strategy_idx
  ON vector_research_run_registry (strategy_id, created_at DESC);
CREATE INDEX IF NOT EXISTS vector_research_run_registry_stage_idx
  ON vector_research_run_registry (stage, created_at DESC);

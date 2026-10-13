CREATE TABLE IF NOT EXISTS rl_capability_registry (
  capability_id TEXT PRIMARY KEY,
  environment_id TEXT NOT NULL,
  algorithm TEXT NOT NULL CHECK (algorithm IN ('ppo','sac','td3','a2c','ddpg')),
  stage TEXT NOT NULL CHECK (stage IN ('training','validation','out_of_sample','paper')),
  observation_space JSONB NOT NULL,
  action_space JSONB NOT NULL,
  reward_policy JSONB NOT NULL,
  train_episodes INTEGER NOT NULL CHECK (train_episodes > 0),
  validation_episodes INTEGER NOT NULL CHECK (validation_episodes > 0),
  out_of_sample_episodes INTEGER NOT NULL CHECK (out_of_sample_episodes > 0),
  seeds JSONB NOT NULL,
  min_validation_reward DOUBLE PRECISION NOT NULL,
  max_drawdown DOUBLE PRECISION NOT NULL CHECK (max_drawdown > 0 AND max_drawdown <= 1),
  max_turnover DOUBLE PRECISION NOT NULL CHECK (max_turnover > 0),
  min_seed_agreement DOUBLE PRECISION NOT NULL CHECK (min_seed_agreement > 0 AND min_seed_agreement <= 1),
  live_execution_enabled BOOLEAN NOT NULL DEFAULT FALSE CHECK (live_execution_enabled = FALSE),
  status TEXT NOT NULL CHECK (status IN ('proposed','assessed','approved','deployed','retired','rejected')),
  evidence JSONB NOT NULL,
  provenance TEXT NOT NULL,
  implementation_hash TEXT NOT NULL,
  evidence_hash TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS rl_capability_registry_environment_algo_uq
  ON rl_capability_registry (environment_id, algorithm, capability_id);
CREATE INDEX IF NOT EXISTS rl_capability_registry_status_idx
  ON rl_capability_registry (status);

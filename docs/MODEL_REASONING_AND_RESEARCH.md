# Helix Model Reasoning + Research Lifecycle

## Model-backed worker reasoning

`src/trading/ai/model-reasoning.ts` defines a provider-neutral model boundary. The worker supplies:

- worker identity, family, specialization, and capabilities
- explicit task type and debate topic/round
- only the durable evidence packets selected for the task
- the worker policy version and allowed tool capabilities

The model must return structured JSON containing summary, assumptions, evidence IDs, stance, confidence, and critique. Evidence citations are validated against the supplied evidence set; invented IDs are rejected.

The default worker bridge can switch to the model path when these server-only environment variables are configured:

- `HELIX_MODEL_ENDPOINT`
- `HELIX_MODEL_ID`
- optional `HELIX_MODEL_API_KEY`

Secrets never belong in worker payloads. The model provider is outside the millisecond execution path.

## Durable reasoning provenance

`src/trading/runtime/reasoning-store.ts` stores model/deterministic reasoning records with:

- task and worker identity
- provider and model ID
- policy version
- input and output hashes
- structured reasoning trace
- deterministic reason ID

Migration `0010_trading_research.sql` adds `trading_worker_reasoning`.

## Research experiment lineage

`src/trading/research/experiment.ts` defines the immutable lifecycle:

`research -> backtest -> out_of_sample -> walk_forward -> paper -> promoted/retired`

Each experiment has a strategy ID, optional parent experiment, immutable spec hash, and explicit stage transitions. Evaluation results are separately hashed and timestamped.

Migration `0010_trading_research.sql` adds `trading_research_experiments` and `trading_research_evaluations`.

## Walk-forward / OOS validation

`src/trading/research/walk-forward.ts` runs deterministic rolling folds. Training and OOS windows are strictly disjoint. Every fold records its train/test time boundaries and backtest metrics, then aggregates profitability ratio, median return, worst drawdown, mean Sharpe-like score, and fold robustness.

This is a research validation layer, not a live-trading approval mechanism. Promotion to paper or live execution still requires the project readiness gates and independent risk controls.

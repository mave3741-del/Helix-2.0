# Phase 10.8.5 — RL Robustness / Cross-Regime Generalization Gate

## Objective
Combine Phase 10.8.3 multi-seed chronological OOS evaluation with Phase 10.8.4 adversarial stress evaluation into one deterministic promotion gate.

## Contract
- Uses the same distinct seeds and chronological geometry as the multi-seed OOS gate.
- Runs the configured adversarial scenarios independently for every seed.
- Requires the OOS gate to pass.
- Requires a minimum combined stress-case pass rate.
- Requires a minimum fraction of seeds whose complete stress suite passes.
- Degraded-data scenarios remain fail-closed unless explicitly permitted by the stress gate.
- Promotion evidence includes OOS and per-seed stress hashes plus a deterministic combined SHA-256 hash.
- No live-execution capability is introduced or enabled.

## Verification
18/18 focused regression tests pass across robustness, stress, multi-seed OOS, OOS evaluation, and walk-forward separation.

## Certification boundary
This is an engineering/research robustness gate. It is not production/live-trading certification. Dependency-backed typecheck/lint/build and external deployment evidence remain separate gates.

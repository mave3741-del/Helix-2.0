# HELIX Phase 10.8.3 Verification — v0.99.24

## Scope
Combined RL multi-seed + chronological OOS walk-forward evaluation gate.

## Controls
- Requires at least two distinct integer seeds.
- Runs every seed against identical chronological train/test/embargo geometry.
- Requires matching fold counts across seeds.
- Aggregates worst-case drawdown across seeds.
- Uses the minimum profitable-window rate across seeds.
- Computes cross-seed median-return agreement.
- Supports explicit minimum median return and mean Sharpe gates.
- Returns explicit rejection reasons instead of implicit promotion.
- Produces a deterministic SHA-256 evidence hash bound to environment, algorithm, seeds, geometry, aggregate metrics and gate result.
- Does not alter or enable live execution.

## Verification
13/13 combined focused RL/OOS tests PASS.

The suite includes the new Phase 10.8.3 tests plus Phase 10.8.1/10.8.2 and existing walk-forward regressions.

## Certification boundary
This is an engineering/research evaluation gate only. It is not live-trading certification. Dependency-backed typecheck/lint/build remain separately gated by the repository dependency-integrity requirement.

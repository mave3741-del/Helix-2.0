# HELIX Certification Gate — v0.97.3

Date: 2026-09-14

## Scope
Phase 7.4 extended paper-canary cohorts on the v0.97.2 hardened paper-trading baseline.

## Implemented
- Deterministic cohort definitions with explicit session and strategy identity.
- Fail-closed admission requiring referenced Phase 7 sessions to be explicitly `running` and paper-only, active owner capital approval, and live execution disabled.
- Bounded observation windows with maximum duration enforcement.
- Cohort-level rejection, reconciliation, critical-alert, p95-latency, drawdown, slippage, minimum-cycle, minimum-trade and required-regime gates.
- Reconciliation provenance is mandatory for every accepted observation.
- Deterministic safety-first comparison evidence across qualified cohorts using a common observation window.
- SQL/in-memory persistence for cohort state, observations and comparison evidence through migration 0030.
- Phase 7.4 gate is included in `npm test` coverage integrity, Phase 7 preflight, and GitHub CI.

## Verification completed
- Phase 7.4 cohort regression: **9/9 PASS**.
- Phase 7 paper-operation gate: **14/14 PASS**.
- Phase 7 control-room gate: **20/20 PASS**.
- Phase 6 certification tests: **12/12 PASS**.
- Test coverage integrity: **104/104 PASS**.
- Release integrity: **PASS**.
- Migration integrity: **PASS** — 29 numbered migrations.
- Phase 6 preflight: **PASS** on Node 22.16.0 / npm 10.9.2.
- Phase 6 operationalization: **PASS** with live execution disabled.

## Full certification boundary
A clean dependency-backed install is not present in the release workspace. `npm test` was started and reached test 160 with no observed test failure before the execution window expired. `typecheck` is blocked by missing `@types/node` and `vite/client`; `lint` is blocked because the ESLint executable is absent. Full repository typecheck/lint/build/DB-smoke certification is therefore not claimed from this workspace.

## Safety boundary
Live execution remains **DISABLED**. Cohort comparison is evidence-only and cannot authorize live trading, bypass the independent risk engine, or auto-promote a strategy. Real PostgreSQL, connector permissions, deployment-host sandbox runtime evidence, and independent readiness review remain external gates.

## Source measurement
TypeScript/TSX: **31,365 lines across 315 files**. JavaScript/JSX/MJS/CJS: **5,511 lines across 44 files**. Combined counted source: **36,876 lines across 359 files**.

## Next implementation order
1. Phase 7.5 independent post-canary review.
2. Reproduce the complete toolchain certification on clean external CI.
3. Keep live execution disabled until all external production/readiness evidence is independently satisfied.

# HELIX Certification Gate — v0.97.2

Date: 2026-09-14

## Scope
Runtime safety hardening on top of the v0.97.0 test/CI-integrity release.

## Closed findings
- Direct paper execution now requires an attached PaperOperationSession in `running` state. Both market and limit paper-order paths use the same fail-closed gate.
- AgentTradeGateway rejects any connector whose declared mode is not `paper`, requires explicit `riskApproved === true` and `ownerApproved === true`, requires a non-empty `paperSessionId`, and still requires worker/task identity and the final `approved` flag.
- Worker `trade.execute` no longer treats a missing owner approval as approval.
- Specialist evidence review now resolves queued `evidenceIds`, reviews every requested packet, and emits `approved` only when all requested reviews pass the deterministic confidence/stance policy and evidence coverage is exact.
- Windows preflight uses `npm.cmd` on Windows.

## Verification completed
- Targeted runtime/gateway/worker/paper-operation suite: **44/44 PASS**.
- Follow-up closed-loop + runtime safety suite: **33/33 PASS**.
- Phase 7 paper-operation gate: **14/14 PASS**.
- Phase 6 certification tests: **12/12 PASS**.
- Release integrity: **PASS**.
- Migration integrity: **PASS** — 28 numbered migrations.

## Full certification boundary
A complete `npm test` run was started from the v0.97.2 workspace but the execution window expired before the complete suite finished. `npm ci` also hit the environment transport timeout. The hydrated workspace is missing `@types/node`, `vite/client`, `eslint`, `@electric-sql/pglite`, and `vite`, so typecheck, full lint, DB smoke, and build cannot be honestly claimed as PASS in this environment.

## Safety boundary
Live execution remains disabled. No worker receives raw private keys or unrestricted production authority. v0.97.2 is an engineering hardening release and must not be labeled production/live certified until clean dependency-backed CI, database/connector validation, deployment-host sandbox runtime evidence, and independent review pass.

## Current source measurement
30,590 TS/TSX lines across 311 files + 5,511 JavaScript/JSX/MJS/CJS lines across 44 files = **36,101 combined counted source lines** across 355 files.

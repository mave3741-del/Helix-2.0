# HELIX Certification Gate v0.99.2 — Phase 8.12

## Phase
Phase 8.12 — Governed Worker Runtime Bootstrap + Native Execution Boundary

## Implemented
- Connected `TradingWorkerActivationService.bootstrap()` to durable native-tool reconciliation. Worker supervisor bootstrap is not reached when deployed-tool records are drifted or unsafe.
- Added `GovernedNativeToolRuntime` as the server worker native-execution facade. It requires reconciliation first and permits execution only for durable records whose lifecycle is `deployed`.
- Routed server worker market snapshot, technical signal, risk check, and backtest calls through the governed native runtime; the fallback direct handlers remain only for isolated unit construction that does not provide the governed runtime.
- Added an activation regression proving missing built-ins remain `proposed` and are not auto-deployed during worker startup.
- Preserved live-trading DISABLED invariant.

## Verification
- Phase 8.12 worker-runtime + registry focused tests: 17/17 PASS.
- Phase 8.11 registry gate: 15/15 PASS.
- Test coverage integrity: 110/110 test files reachable.
- Migration integrity: 31 numbered migrations hashed.
- Release integrity: PASS.
- Dependency-backed typecheck/lint/build remain blocked until dependencies are hydrated in the external certification environment.
- Real PostgreSQL, connector, deployment-sandbox, and independent readiness evidence remain external gates.

## Safety
- Live trading remains DISABLED.
- Native runtime never grants wallet/private-key access.
- Startup reconciliation never auto-promotes a tool from `proposed` to `deployed`.

# HELIX v0.98.4 Certification Gate — Phase 8.5

Status: ENGINEERING PASS / external certification still pending

## Phase 8.5 — Durable Event-to-Worker Routing
Implemented a server-side bridge from selected strategic/tactical runtime events to the durable worker task queue.

### Safety contract
- Raw `market.tick` is excluded from the default allowlist.
- Risk alerts receive the highest routing priority.
- Task identity is deterministic from event identity.
- Queue duplicate semantics remain authoritative.
- Event publication awaits routing completion rather than fire-and-forget scheduling.
- The router cannot enable live trading or bypass risk/readiness controls.

### Verification
- Event-router focused tests: 4/4 PASS.
- ServerTradingRuntime regression: 17/17 PASS.
- Combined focused routing/runtime regression: 21/21 PASS.
- Main test-file coverage: 106/106.
- Migration schema unchanged by this phase.
- Live execution: DISABLED.

### External boundary
Clean dependency-backed typecheck/lint/full-suite/build, real PostgreSQL execution, connector permissions, deployment-host sandbox probing, and independent external reviewer evidence remain required before any production/live certification.

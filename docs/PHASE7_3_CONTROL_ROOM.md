# HELIX Phase 7.3 — Operational Control Room & Alert Routing

## Scope

Phase 7.3 converts operational signals into a deterministic control-room routing layer for paper operations. It does not enable live trading.

## Incident routing

- **Reconciliation**: critical events automatically roll an active paper session back.
- **Database/persistence**: critical events automatically roll an active paper session back.
- **Security boundary**: critical events abort the active paper session and require independent review before re-arming.
- **Market-data / worker health**: warning events halt new candidate generation; critical events pause paper submission.
- **Latency**: warning and critical events route to the latency runbook and can pause/rollback paper operations according to severity.
- **Paper-session**: operation/session alerts route to the session-control runbook.
- **Unknown**: the system pauses paper submission until an operator classifies the incident.

## Runbook contract

Every route contains a deterministic incident class, severity, action, automatic action (when applicable), operator-required flag, ordered required steps, and a SHA-256 route hash.

The control room is advisory for warning conditions and fail-closed for critical conditions. It cannot enable live execution and never replaces the independent risk engine.

## Acceptance

1. Every supported incident family has a non-empty ordered runbook.
2. Critical reconciliation/database/security events trigger deterministic session rollback/abort behavior.
3. Warning market-data/worker events do not silently abort an otherwise healthy paper session.
4. Routes are hash-addressable for audit evidence.
5. Phase 7.3 tests run explicitly in CI and through the Phase 7 preflight graph.

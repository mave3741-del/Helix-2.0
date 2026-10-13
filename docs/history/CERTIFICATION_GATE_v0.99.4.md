# HELIX v0.99.4 — Phase 8 FINAL Engineering Certification Gate

## Status

**Engineering status: COMPLETE**

**External certification status: PENDING EXTERNAL EVIDENCE**

Live execution remains **DISABLED**.

## Phase 8 FINAL scope

Phase 8 closes the native-tool governance and server-runtime engineering boundary. The release includes:

- governed native-tool factory with deterministic lifecycle control
- durable native-tool registry and restart reconciliation
- worker capability → native-tool routing without permission escalation
- server worker bootstrap gated by native-tool reconciliation
- governed native-tool execution limited to deployed records
- auditable approval/deployment service with independent reviewer, conflict declaration, evidence IDs, reason, schema hash, implementation hash, and durable decisions
- catalog/factory parity verification for all 16 native trading/research tools
- fail-closed fingerprint and safety-policy checks

## Local verification

- Phase 8 focused/runtime suite: **30/30 PASS**
- Migration integrity: **32/32 numbered migrations PASS**
- Release integrity: **PASS**
- Test coverage integrity: **111/111 PASS**
- Consolidated engineering gate: **ENGINEERING_COMPLETE**

## External boundary

The following items are intentionally not claimed as completed because they require infrastructure/evidence not present in this workspace:

1. clean dependency-backed typecheck/lint/full-test/build after successful `npm ci`
2. real PostgreSQL migration/schema/DB-smoke execution
3. real connector staging permission and readiness evidence
4. deployment-host sandbox runtime/attestation evidence
5. independent readiness review evidence

An `npm ci` attempt in this workspace ended in a transport timeout, leaving `node_modules` absent. No live-trading gate was weakened to compensate.

## Safety

Phase 8 does not enable live trading, does not grant workers wallet/private-key access, and does not allow generated native tools to bypass the independent risk engine.

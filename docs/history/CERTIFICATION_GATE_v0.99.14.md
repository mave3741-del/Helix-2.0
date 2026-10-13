# Certification Gate v0.99.14 — Phase 9.10

## Result
**LOCAL ENGINEERING GATE PASS / REAL POSTGRESQL VERIFICATION READY**

Phase 9.10 adds a focused real-PostgreSQL verification orchestrator. The repository now has a single bounded command for the database boundary once a real `DATABASE_URL` is supplied.

## Implemented
- `scripts/postgres-certification.mjs`
- `scripts/postgres-certification.test.mjs`
- npm script: `phase9.10:postgres`
- package/lock version: `0.99.14`

## Verification scope
The Phase 9.10 gate runs, in order:
1. `db:migrate`
2. `db:verify`
3. `db-immutability-verify.mjs`

The gate writes `artifacts/postgres-certification-evidence.json` and never intentionally serializes the raw `DATABASE_URL` or its password.

## Current state
The new contract test is locally verifiable without PostgreSQL credentials. Real PostgreSQL execution is **not claimed in this container**. The user's Windows PostgreSQL 18.6 installation must supply the real `DATABASE_URL` and run the gate externally.

## Still external
Real connector permission evidence, deployment-host sandbox/attestation, dependency-complete CI, and independent external readiness review remain required. Live trading remains disabled.

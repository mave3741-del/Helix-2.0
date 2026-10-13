# HELIX Certification Gate — v0.98.0

## Phase 8.1 — External Certification Orchestrator

### Engineering status
- External certification orchestrator implemented.
- Real PostgreSQL verification extended through Phase 7 persistence tables.
- Evidence report is secret-safe and hashable.
- External gate is fail-closed on missing environment evidence.
- Live execution remains disabled.

### Local verification
- External-certification contract tests: 4/4 PASS.
- Test coverage integrity: 105/105 PASS.
- Release integrity: PASS.
- Migration integrity: PASS across 30 migrations.
- `npm run external:certify` in this source-only workspace: BLOCKED as expected because real external staging evidence is not configured.

### External boundary still required
A genuinely clean external CI environment must run with:
- Node 22.x / npm 10.x
- hydrated `npm ci`
- complete `ci:certify`
- a real `DATABASE_URL` with migration and immutability verification
- reviewed connector credentials/permissions and connector readiness evidence
- deployment-host sandbox runtime evidence
- independent reviewer identity distinct from the implementer

### Safety boundary
This release does not enable live trading. External certification cannot approve a live session, allocate capital, bypass the independent risk engine, or promote a strategy automatically.

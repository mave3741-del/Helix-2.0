# HELIX Phase 9 — External Certification Reproducibility Audit v0.99.5

## Status
Phase 9 reproducibility harness implemented and locally contract-verified. Production/external certification remains pending because the current workspace does not contain hydrated dependencies, a real PostgreSQL target, staging connector permissions, deployment-host sandbox evidence, signed deployment attestation, or independent reviewer evidence.

## Implemented
- Added `scripts/external-certification-preflight.mjs` as a dependency-free fail-closed preflight.
- Added `scripts/phase9-preflight.test.mjs` and `scripts/db-verify.contract.test.mjs`.
- Hardened `scripts/db-verify.mjs` uniqueness checks to query PostgreSQL schema constraints directly rather than relying on fragile index-definition text ordering.
- Added `EXTERNAL_CERTIFICATION_ENV.example` with placeholders only.
- Added `docs/PHASE9_EXTERNAL_CERTIFICATION.md` runbook.
- Added npm scripts: `phase9:preflight`, `phase9:contract`, and `phase9:certify`.
- Updated package/lock version to `0.99.5` and Master to `v1.66`.

## Verification
- Phase 9 contract/preflight tests: 4/4 PASS.
- CI environment verification: PASS (Node 22.16.0, npm 10.9.2, lockfileVersion 3).
- Migration integrity: PASS for 32 numbered migrations.
- Test coverage integrity: PASS, 111/111 test files reachable.
- Release integrity: PASS after final package alignment.
- Dependency hydration: BLOCKED because `node_modules` is absent; earlier `npm ci` transport attempt timed out.
- Real PostgreSQL verification: NOT RUN; no external `DATABASE_URL` supplied.
- Connector staging probe: NOT RUN; no external staging endpoint/evidence supplied.
- Deployment sandbox attestation: NOT RUN; no deployment-host attestation supplied.
- Independent readiness review: NOT RUN; no independent reviewer evidence supplied.

## Safety
Live trading remains disabled. Phase 9 tooling cannot enable live execution or bypass the independent risk engine.

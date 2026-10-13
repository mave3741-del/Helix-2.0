# Phase 8.1 — External Certification Orchestrator

## Status

Implemented in v0.98.0. Live execution remains disabled.

## Purpose

Phase 8.1 converts the previously manual external-production certification boundary into a deterministic, fail-closed orchestration gate. It does not grant live-trading authority. It requires independently supplied deployment, connector, database, and reviewer evidence before it will execute the full certification chain.

## Required external evidence

The gate requires:

- `HELIX_EXTERNAL_STAGING=true`
- a real `DATABASE_URL`
- `HELIX_STAGING_CONNECTOR_READY=true`
- deployment sandbox attestation: container isolation, restricted network, isolated filesystem, raw-key denial, privilege restriction, and worker builtin/network escape blocking
- distinct reviewer and implementer identities
- explicit conflict declaration
- `HELIX_LIVE_EXECUTION` not enabled

Sensitive values are not serialized into the evidence report. The report records presence/boolean state, execution results, and an evidence hash.

## Certification sequence

When prerequisites are present, `npm run external:certify` runs:

1. CI environment verification
2. Release integrity
3. Migration integrity
4. Test coverage integrity
5. Phase 6 certification
6. Phase 7 preflight
7. Full `ci:certify`
8. Real Postgres migrations
9. Real Postgres schema/content-hash verification
10. Database immutability verification
11. Deployment sandbox contract verification

The command stops at the first failure and writes `artifacts/external-certification-evidence.json`.

## Database hardening

`db-verify.mjs` now verifies the Phase 7 persistence surfaces in addition to the earlier control-plane schema, including paper-operation sessions, canary cohorts/observations/comparisons, and independent post-canary reviews.

## Safety boundary

This gate is a certification mechanism only. It cannot enable live execution, approve capital, re-arm paper sessions, bypass risk controls, or promote a strategy. Any missing external evidence produces a `BLOCKED` result.


## Phase 8.2 — Dependency Hydration Integrity (v0.98.1)

Dependency hydration is now a first-class prerequisite for any complete certification run. The dependency gate verifies Node 22.x, npm 10.x, lockfileVersion 3, package/package-lock version alignment, and installed manifests for all direct dependencies and devDependencies. An incomplete installation is explicitly BLOCKED before typecheck, lint, full tests, DB smoke, or build.

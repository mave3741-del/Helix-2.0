# HELIX Certification Gate — v0.97

Date: 2026-09-13

## Scope
Full Phase 1–7 audit of the v0.96.0 "Phase 7.2 — Paper Session Persistence + Recovery" release.

## Headline finding
The project's own "full" test gate was silently incomplete. `npm test` — the script `ci:certify`, `ci:prod`, and `ci:full` all depend on — never ran 20 of the repository's 102 `*.test.ts` files. `.github/workflows/ci.yml` ran a Phase 6 gate step explicitly but never invoked `phase7:paper-ops`, so this release's own namesake feature (paper-session persistence) had never actually run in CI. Running the 20 orphaned files directly surfaced 4 real, previously-uncaught failures — two invalid test fixtures and two safety-relevant assertions that a fresh/recovered organization state was not defaulting to the intended value. All four are fixed; full detail is in `docs/WORK_CONTINUITY_LOG.md` under **v0.97**.

## Verified locally (clean environment, single unbroken run)
- `npm ci`: clean, 430 packages, 0 vulnerabilities.
- `npm run typecheck`: **0 errors**.
- `npm run lint`: **0 errors, 0 warnings**.
- `npm test`: **376/376 PASS** — now genuinely covers every test file in `src/` (previously reported as "309/309", a number that silently excluded 20 files).
- `npm run phase6:certify`: **12/12 PASS**.
- `npm run phase7:paper-ops`: **14/14 PASS** — now also wired into `.github/workflows/ci.yml` as its own step, matching the existing Phase 6 pattern.
- `npm run ci:certify` (release-integrity → migration-integrity → typecheck → lint → full test → db:smoke → build), run as one unbroken sequence from a clean state: **PASSES**. Every certification document in this repository's history reports being blocked before reaching this point; this is the first recorded clean pass all the way through.

## Two verification scripts were themselves broken
- `scripts/release-integrity.mjs` correctly rejects a workspace containing `.helix/` (the sandbox worker's real, git-ignored working directory). The delivered release zip for this audit contained it anyway — evidence the zip was packaged from a workspace where tests had already run, not a clean checkout. This is a packaging-process gap, not a source defect; `.helix/` was already correctly listed in `.gitignore`.
- `scripts/db-smoke.mjs` checked for a unique index via `pg_indexes.indexdef like '%decision_hash%unique%'`. Verified directly against PGLite that Postgres always renders this as `CREATE UNIQUE INDEX ... (decision_hash)` — "UNIQUE" precedes the column name and is uppercase — so this check could never have matched, regardless of whether the constraint existed. The actual migration was already correct; only the check was broken. Replaced with a proper `information_schema.table_constraints` query, verified against PGLite before and after.

## What this does and does not certify
This confirms the source, its test suite, and its build are internally consistent and that the certification chain the project defines for itself actually runs clean end-to-end for the first time. It does **not** certify production readiness. Still outstanding, unchanged from every prior gate in this repository:
- Reproducing this exact result on the actual external CI infrastructure from a genuinely fresh checkout.
- Real external PostgreSQL credentials and connector-permission validation.
- Deployment-host sandbox *runtime* probes (the static contract check passes; this is not a substitute for running the container under attack conditions).
- Independent production review.

## Non-blocking cleanup items carried forward
- Add a CI step that fails the build if any `src/**/*.test.ts` file is unreachable from either the main `test` script or a named `phase*:` gate script, so a coverage gap of this shape cannot silently recur.

## Security boundary
Unchanged: live trading remains disabled, no worker is granted raw private keys or unrestricted network/filesystem access, and production/live enablement requires clean external CI, database/connector validation, deployment sandbox runtime validation, and independent readiness review.

## Release state
v0.97 is a test-coverage and verification-integrity correction release, not a production-readiness release. It must not be labeled production-ready until the external, infrastructure-level items above are satisfied.

# HELIX Phase 9.8 Final Audit — v0.99.12

## Result
Phase 9.8 adds a reproducible certification-run ledger that fingerprints the exact package, lockfile, source tree, Node/npm environment, and certification evidence inputs used for an external certification attempt.

## Implemented
1. `scripts/certification-run-ledger.mjs` creates a deterministic environment/run record and canonical record hash.
2. The source-tree fingerprint uses the fixed project extension rule and excludes node_modules, .git, artifacts, dist and coverage.
3. External certification evidence and preflight artifacts are referenced by SHA-256 without serializing credentials.
4. The run ledger records `PENDING_EXTERNAL_PASS` until a real external certification PASS is explicitly supplied; it never manufactures a PASS.
5. Migration `0037_certification_run_ledger.sql` adds append-only durable persistence with database mutation triggers.

## Verification
- Phase 9.8 focused tests: 4/4 PASS.
- Migration integrity: 36/36 PASS.
- Release integrity: local gate run after metadata alignment.
- Live execution: DISABLED.
- Fixed source count: 40,350 lines / 397 code files using the project counting rule.

## External boundary
Real dependency-backed typecheck/lint/build, PostgreSQL execution of the ledger migration, connector staging permissions, deployment-host sandbox/attestation, and independent external certification remain external evidence requirements.

## Source measurement
Fixed project counting rule: 40,350 lines across 397 code files (.ts, .tsx, .mts, .mjs, .js, .jsx; node_modules excluded).

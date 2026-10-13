# HELIX Certification Gate — v0.98.2

## Phase 8.2 — Dependency Hydration Integrity

Status: **ENGINEERING COMPLETE / EXTERNAL ENVIRONMENT GATE REQUIRED**

### Objective
Make dependency hydration an explicit, deterministic certification prerequisite so a partial or missing `node_modules` tree cannot produce an ambiguous test result or be mistaken for full certification.

### Implemented
- Added `scripts/dependency-integrity.mjs`.
- Enforces Node 22.x and npm 10.x certification versions.
- Enforces lockfileVersion 3 and package/package-lock version alignment.
- Verifies every direct dependency and devDependency has an installed package manifest.
- Emits `artifacts/dependency-integrity.json` with machine-readable reasons and counts.
- `ci:certify` now runs dependency integrity before typecheck/lint/test/build.
- `external:certify` now fails immediately when dependency hydration is incomplete.
- Version synchronized to v0.98.2.

### Current local evidence
The supplied release workspace intentionally has no hydrated `node_modules` tree. A fresh `npm ci --ignore-scripts` was attempted and hit the container transport timeout. Therefore dependency integrity is correctly **BLOCKED** locally rather than silently treated as a test failure or pass.

### Safety boundary
This gate does not enable live trading. Live execution remains disabled. A future external certification environment must hydrate dependencies successfully before full certification is considered valid.

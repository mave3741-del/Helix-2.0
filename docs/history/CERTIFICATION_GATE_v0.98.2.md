# HELIX Certification Gate — v0.98.2

## Phase 8.3 — Direct-Command Dependency Guard

### Purpose
Prevent direct developer/CI commands from producing misleading failures when the locked dependency tree is absent or incomplete.

### Changes
- `pretest` -> `dependency:integrity`
- `pretypecheck` -> `dependency:integrity`
- `prelint` -> `dependency:integrity`
- `prebuild` -> `dependency:integrity`
- `predb:smoke` -> `dependency:integrity`
- Package and lockfile synchronized to v0.98.2.

### Local boundary
The current source-only workspace has no hydrated `node_modules`. `npm ci --prefer-offline --no-audit --no-fund` was attempted and hit the container transport timeout. Therefore dependency-backed certification remains BLOCKED locally.

### Safety
Live execution remains DISABLED. This gate is certification hardening only.

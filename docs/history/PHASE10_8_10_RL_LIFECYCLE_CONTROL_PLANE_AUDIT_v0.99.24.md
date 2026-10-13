# HELIX Phase 10.8.10 — RL Unified Lifecycle Control Plane

## Scope
Phase 10.8.10 unifies the existing RL scheduler, continuous reassessment, promotion ledger, and champion/challenger lineage into a deterministic lifecycle decision boundary.

## Decisions
- `promote`: challenger evidence is fresh, not missed, and has a promoted ledger entry.
- `retain`: champion is healthy and no challenger promotion is currently actionable.
- `rollback`: champion reassessment fails or champion evidence is unhealthy.
- `hold`: challenger evidence is missing/stale/missed, so no promotion is permitted.

## Safety
The control plane is research/paper-only. It does not enable live execution. Evidence hashes and ledger identities are validated before a decision is produced.

## Persistence
Migration `0049_rl_lifecycle_control_plane.sql` adds an append-only lifecycle audit table with a unique deterministic hash and UPDATE/DELETE trigger protection.

## Verification
Five focused lifecycle tests cover promotion, rollback, hold, identity mismatch, and invalid evidence/ledger hashes.

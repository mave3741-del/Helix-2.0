# Trading Runtime Recovery

## v0.15 snapshot/projection recovery (completed)

Helix persists a versioned server-runtime checkpoint containing runtime controls, paper-account state, paper order/fill state, and the deterministic event cursor. State-changing operations checkpoint immediately while non-fill market ticks use bounded periodic checkpoints.

The durable evidence/debate layer added in v0.16 is separate from the account snapshot schema and has its own SQL projections for evidence packets, specialist fan-out, debate sessions, rounds, and turns.

## v0.16 recovery interaction

Evidence and debate tasks are durable queue work. On process restart, the task queue and worker supervisor recover abandoned leases while evidence/debate records remain immutable/idempotent in their respective stores. This prevents a restart from losing specialist work or creating duplicate debate turns.

## Remaining recovery hardening

Full event-sourced projection rebuild from the authoritative event journal remains a later hardening step. The current snapshot mechanism intentionally uses bounded checkpointing to protect the high-rate market path.

## Verification

The focused trading regression suite passes. SQL-backed implementations are migration-backed but the current environment has no installed dependency tree, so live database execution and clean-environment typecheck/build remain unverified.

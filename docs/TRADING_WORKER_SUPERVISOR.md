# Trading Worker Supervisor — v0.12

Helix now has the first server-side orchestration layer connecting durable trading tasks to the exact 1,000-worker trading identity set.

## Worker registry

`src/trading/runtime/worker-registry.ts` creates deterministic identities `W-0001` through `W-1000` / `WORKER-0001` through `WORKER-1000`, with specialization, family, market coverage, capabilities, methodology, model preference, policy version, workload and performance counters. The SQL implementation persists these identities in `trading_worker_registry`; the in-memory implementation is used for deterministic tests.

The generated specialization sequence mirrors the existing trading workforce mapping: the same deterministic `tradingProfile()` index is used for each worker number.

## Supervisor lifecycle

`src/trading/runtime/worker-supervisor.ts` implements:

`PEEK → ROUTE → CLAIM → LEASE → HEARTBEAT → EXECUTE → RESULT/PROVENANCE → COMPLETE or FAIL → RETRY/DEAD-LETTER → RELEASE`

The supervisor is bounded to 1–1,000 concurrent slots and defaults to 32. It supports both one-shot polling and a server-side `start()` / `stop()` lifecycle.

## Deterministic routing

Tasks may provide routing hints for `family`, `market`, `requiredCapability`, or `preferredWorkerId`. Event-generated tasks infer routing automatically for market, news, macro, risk, and strategy event families. The final worker choice uses a deterministic score and worker-number tie-break.

## Durable results and provenance

`src/trading/runtime/task-results.ts` persists one result per `(task_id, attempt_count)` with output, execution timing, worker identity, input/output hashes, executor ID, and a provenance hash. SHA-256 is used when Web Crypto is available; the fallback is deterministic and non-secret.

Worker performance counters are updated after each attempt: completed tasks, failed tasks, total latency, total tokens, and last error.

## Crash/restart recovery

Supervisor bootstrap first recovers expired task leases and then clears stale worker registry leases. This closes the failure mode where a crashed process could leave a worker permanently marked busy even after its queued task became reclaimable.

The queue still remains authoritative for task ownership. Full account-state recovery (cash, positions, risk projections) is a separate later milestone.

## Safety boundary

This supervisor does not enable live trading and does not grant workers wallet/private-key access. Execution is supplied through an injected `WorkerExecutor`, allowing the research layer, model router, or future isolated worker runtime to remain behind explicit controls.

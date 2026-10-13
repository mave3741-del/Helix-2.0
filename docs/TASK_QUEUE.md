# Helix Durable Worker Task Queue

Helix now has a server-side queue boundary for durable worker orchestration.

## State machine

`queued -> running -> completed`

`queued -> running -> queued` on retryable failure until `maxAttempts` is exhausted.

`running -> queued` when a lease expires and the attempt budget remains.

`running -> dead_letter` when a failure or expired lease exhausts the attempt budget.

## Production behavior

The SQL implementation stores task payloads as JSONB and uses `FOR UPDATE SKIP LOCKED` during claim so independent server workers can safely compete for work. Worker ownership is lease-based; heartbeats extend the lease and only the current worker may heartbeat/complete/fail its task.

## Current boundary

`ServerTradingRuntime.enqueueWorkerTask()` is the integration point. The next step is a persistent worker supervisor that binds this queue to Helix's exact 1,000 identities and routes only relevant events to each worker.

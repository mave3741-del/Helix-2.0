# Replay Manifests

Helix v0.13 adds deterministic replay manifests over persisted `trading_market_ticks`.

## Purpose

A replay manifest makes a historical tick range addressable and reproducible. It records the exact symbol/venue scope, exchange-time window, tick count, boundary sequences, ordered data hash, and a manifest hash derived from the same immutable identity fields. Generation does not include wall-clock time in the hashed identity, so rebuilding the same range produces the same hashes.

## Source

The production source is the durable `trading_market_ticks` projection introduced in v0.10. The in-memory recorder implements the same range contract for deterministic tests.

## Integrity rules

- Records are ordered by `exchange_ts`, then `sequence`, then `event_id`.
- Duplicate logical ticks (`symbol + venue + exchange_ts + sequence`) are rejected.
- The manifest `dataHash` covers event IDs and the normalized tick payload in deterministic order.
- The manifest `manifestHash` covers the replay scope metadata plus `dataHash`.
- Verification recomputes both hashes and detects payload, ordering, or scope tampering.
- A manifest is a provenance boundary; it does not itself assert that a strategy is profitable.

## API

`buildReplayManifest(recorder, query)` returns the manifest plus the exact persisted records used to create it.

`verifyReplayManifest(manifest, records)` returns true only when the supplied records still match the recorded provenance.

Query filters support symbol, venue, inclusive exchange-time bounds, and a bounded record count.

## Next

The next trading-runtime milestone is realistic paper-order lifecycle simulation: open orders, partial fills, cancel/reject states, latency, slippage, and venue fee schedules.

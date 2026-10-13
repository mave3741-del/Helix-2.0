# HELIX Phase 10.3 — Event-Driven Fast-Path Execution Contract

## Purpose
Phase 10.3 turns LEAN-style event-driven execution discipline and NautilusTrader-style deterministic fast-path principles into a HELIX-native contract without importing a live execution dependency.

## Contract
- Market ticks are normalized into deterministic `market.tick` events.
- Event identity is content-hashed for retry/idempotency protection.
- Sequence numbers must move monotonically; duplicate and out-of-order events fail closed.
- Stale/invalid market data is rejected before signal/risk routing.
- Fast-path decisions use deterministic local signal and hard-risk functions only.
- The fast path has an explicit latency budget and produces a deterministic decision hash.
- Paper-session state is required for route admission.
- Live execution is structurally disabled in this contract.
- LLMs, remote reasoning, and unrestricted network calls are outside the fast path.

## Verification
The focused Phase 10.3 contract test covers valid deterministic routing, stale-data rejection, duplicate/out-of-order rejection, paper-session enforcement, and risk/kill-switch vetoes.

## Boundary
This phase establishes an architecture contract and deterministic paper-only fast path. It does not certify live venue performance, exchange latency, network jitter, or real-money execution. Those remain external validation work.

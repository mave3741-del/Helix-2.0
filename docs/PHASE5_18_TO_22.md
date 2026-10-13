# HELIX Phase 5.18-5.22

## 5.18 - Order / Execution Reconciliation
- Added `order-reconciliation.ts` for deterministic broker-vs-desired-state reconciliation.
- Detects missing open orders, unexpected open orders, status/identity drift, fill quantity anomalies, and position drift.
- Produces a deterministic SHA-256 reconciliation hash.
- Paper/live submission must treat non-reconciled state as fail-closed at the orchestration boundary.

## 5.19 - Broker / Exchange Failover
- Added `BrokerFailoverRouter`.
- Rejects live-mode connectors.
- Tracks per-connector health and consecutive failures.
- Fails over only across known paper connectors.
- Preserves `clientOrderId` as the submission idempotency key; retrying submission remains connector-contract dependent and is not assumed safe by transport timeout alone.

## 5.20 - Market-Data Health / Source Quorum
- Added source health classification with stale, latency, quality and error-rate controls.
- Markets are considered quorum-ready only when the configured minimum number of healthy sources cover them.
- `assertMarketDataReady` fails closed when no valid quorum is available.

## 5.21 - Observability / Alerting
- Added in-process observability bus with request/error counters, p95 latency, structured events and threshold alerts.
- Critical events, excessive error rates, and high latency produce explicit alerts.

## 5.22 - Deployment-Level Sandbox Enforcement
- Added strict deployment sandbox policy over the existing attestation layer.
- Requires container enforcement, controlled network policy, filesystem isolation, raw-key denial and privilege restriction.
- Missing controls make deployment readiness fail closed.

## Verification
Focused tests were added for all five steps. Existing Phase 5 behavior is preserved; these modules are additive and deterministic.

Live execution remains disabled. These controls do not certify external production connectivity; external CI, credentials, broker terms, staging DB and deployment sandbox evidence are still required before any future live-use readiness decision.

# Worker Execution and Source Ingestion — v0.17

## Purpose

Connect durable evidence/debate tasks to an executable worker bridge and establish a safe HTTP-JSON public-source ingestion path.

## Worker execution bridge

`src/trading/runtime/worker-execution.ts` adds a capability-bound worker task engine. A worker may execute only tools granted by its declared capabilities. Current deterministic native handlers include:

- `market.snapshot`
- `technical.signal`
- `risk.check`
- `backtest`
- `evidence.review`
- `debate.record`

Each completed task returns a structured reasoning trace containing worker identity, policy version, assumptions, evidence IDs, stance/confidence when applicable, and tool-call hashes. The existing durable supervisor persists that output and provenance in the task-result store.

The default reasoning provider is intentionally deterministic. It is a safe execution scaffold, not a claim of human-level or model-level trading intelligence. A future model-backed provider can implement the same `WorkerReasoningProvider` contract without changing queue semantics.

## Source ingestion

`src/trading/data/source-ingestion.ts` adds `HttpJsonSourceAdapter` and `SourceEvidenceIngestor`/`SourceEvidencePipeline`.

The adapter requires an explicit host allowlist, rejects embedded URL credentials, rejects obvious localhost/private hostnames, rejects non-HTTP(S) schemes, uses bounded response sizes, and applies request timeouts. Redirects are disabled by default. Production deployment still requires network egress controls or a hardened proxy because hostname allowlisting alone is not a full SSRF boundary.

Source payloads become normal Helix evidence packets with source URL, adapter ID, HTTP status, retrieval timestamp, and response headers preserved as provenance. The pipeline can then fan out that packet into durable specialist review tasks.

## Integration flow

`configured public source -> HTTP JSON adapter -> evidence packet -> evidence fan-out -> durable worker task -> capability-bound tool/reasoning -> durable task result -> debate/research state`

## Verification

Dedicated tests cover source allowlisting, bounded fetch behavior, provenance persistence, source-to-fanout integration, worker evidence review, worker debate turn recording, supervisor execution, capability enforcement, and native technical-tool execution.

Focused trading regression after v0.17: **55/55 passing**.

Clean-environment typecheck/build remains unverified because the supplied workspace does not have its dependency tree installed. Live execution remains disabled.

## v0.19 Source-Specific Adapter Layer

Added `src/trading/data/source-specific.ts` with deterministic, source-aware adapters and normalizers for FRED/ALFRED economic series, SEC EDGAR company submissions, and Alpha Vantage news/sentiment. Each normalizer produces a common point-in-time observation containing `eventTs`, `publishedTs`, `availableTs`, value, and provenance, then applies the existing `validatePointInTime()` gate. This keeps revisions/future publications out of historical worker evidence.

The adapter registry now declares these capabilities and their PIT status. Source-specific adapters still flow through the existing HTTP security boundary and can be connected to evidence/fan-out after deployment credentials and provider policy are configured.

## v0.20 Durable evidence-quality and PIT bridge

Added `src/trading/evidence-quality.ts` with deterministic source-tier, PIT-validity, provenance, freshness, and temporal-completeness scoring. Quality is durable metadata, not a trading signal and not proof of truth.

Added `src/trading/source-evidence-pipeline.ts` to convert accepted source-specific observations into deterministic evidence packets with explicit `eventTs`/`publishedTs`/`availableTs`/`asOfTs` metadata, quality scores, and the existing bounded specialist fan-out path.

Added `migrations/0009_trading_evidence_quality.sql` and `EvidenceQuery.minQuality` for durable quality filtering. Regression coverage reaches 70/70 in the current trading-focused suite.

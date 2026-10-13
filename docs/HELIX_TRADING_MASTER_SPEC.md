# HELIX Trading Intelligence — Master Specification

Version: 1.0
Purpose: Transform Helix 2.0 into a private, trading-focused, 1,000-worker research and paper-trading organization.

## 1. Mission
Helix has one mission: collectively develop robust trading intelligence across crypto, equities, FX, commodities, futures, and other legally accessible markets. The 1,000 workers are specialized but strongly coordinated through shared evidence, memory, events, experiments, strategies, and performance history.

The objective is robust, risk-adjusted performance and continuous learning—not guaranteed profit, omniscience, or an “unbeatable” claim.

## 2. Core principles
- One shared trading mission; many specialist roles.
- Workers cooperate and independently challenge each other.
- Every major claim is evidence-backed and time-stamped.
- Research, backtesting, out-of-sample validation, walk-forward testing, stress testing, and paper trading precede real capital.
- Failed experiments remain useful knowledge and are never silently erased.
- Public information is ingested lawfully and evaluated for source quality and latency.
- Live execution is disabled until explicit readiness gates are satisfied.
- Risk controls are hard constraints and cannot be bypassed by an LLM worker.

## 3. Workforce model
Exactly 1,000 persistent worker identities. Each worker has a unique ID, specialty, system policy, tools, memory, research notebook, hypotheses, strategies, experiments, performance history, and peer relationships.

Specialist families include:
- Macro/economics
- Fundamental/company analysis
- Technical/market structure
- Quant/statistics/ML
- Options/volatility/derivatives
- FX/futures/commodities
- Crypto/on-chain
- News/event/sentiment
- Alternative data
- Strategy research
- Backtesting/validation
- Portfolio construction
- Risk management
- Execution/microstructure
- Behavioral finance
- Research replication
- Adversarial/Devil’s Advocate
- Data quality/provenance
- Monitoring/operations

## 4. Coordination architecture
All workers communicate through a durable event/task network. Shared artifacts include market observations, evidence packets, hypotheses, strategies, test results, paper trades, post-trade reviews, and risk alerts.

A worker may propose an idea, but relevant independent workers must be able to review it. Cross-domain coordination is mandatory for high-impact decisions.

## 5. Trading intelligence source layer
Continuously ingest legally accessible public sources such as official market/economic data, company filings, central-bank publications, public research, academic material, public news, public datasets, historical data, and open-source GitHub trading/quant repositories.

Every source is stored with provenance, publication time, retrieval time, source type, credibility assessment, and known delay. Source content is transformed into evidence and hypotheses rather than treated as truth automatically.

## 6. Smart-money / whale intelligence
Dedicated workers monitor:
- Crypto large-wallet and on-chain activity where public and lawful.
- Exchange flows and large transfers.
- Known wallet clusters/entities with confidence scores.
- Institutional holdings and disclosures where publicly available.
- Futures/options positioning and public aggregate reports.
- Open interest, volatility, and related market context.

A single whale event is never an automatic trade signal. The system evaluates entity identity, transfer type, historical behavior, market context, news, corroborating signals, and opposing evidence.

## 7. Strategy doctrine library
Helix should research and compare diverse schools of thought, including value, quality, growth, momentum, trend following, macro, quantitative, statistical, event-driven, volatility, options, behavioral finance, market microstructure, portfolio theory, and risk-first approaches.

Historical teachings associated with major investors and traders may be represented as research doctrines and principles, not as literal identity/personality copies.

## 8. Strategy lifecycle
RESEARCH → HYPOTHESIS → STRATEGY SPEC → CODE → BACKTEST → INDEPENDENT AUDIT → OUT-OF-SAMPLE → WALK-FORWARD → STRESS TEST → PAPER TRADE → PERFORMANCE REVIEW → REVISE/RETIRE/PROMOTE → REPEAT.

Required anti-overfitting checks include look-ahead bias, data leakage, survivorship bias, unrealistic fills, transaction costs, slippage, liquidity, regime dependence, and parameter sensitivity.

## 9. Individual worker code
Workers may create research/backtest code for their specialty. Code must run in an isolated execution environment with explicit resource and network controls. Arbitrary worker code must not receive unrestricted host access, credentials, wallets, or production filesystem access.

## 10. Performance and self-improvement
Track worker and strategy metrics such as research quality, test robustness, out-of-sample results, paper-trading performance, risk-adjusted return, drawdown, calibration, and reproducibility.

Strong workers/strategies can be promoted; weak or fragile strategies can be demoted or retired. Promotion must use evidence, not popularity or self-reported success.

## 11. Adversarial research
A dedicated Devil’s Advocate function attempts to disprove every important strategy. It searches for hidden assumptions, overfitting, data leakage, regime fragility, execution realism failures, and contradictory evidence.

## 12. Shared memory
Memory must support provenance, confidence, timestamps, verification state, supersession, contradictions, and links to source evidence and experiments. Semantic retrieval should evolve toward embeddings/vector search and reranking as the platform matures.

## 13. CEO / collective decision layer
The Trading CEO aggregates evidence from specialist councils. CEO output must actually influence planning and not merely annotate a plan produced by a disconnected local heuristic.

Suggested councils: Macro, Fundamental, Technical, Quant, Derivatives, Crypto, News, Strategy Lab, Risk, Execution, and Adversarial Research.

## 14. Paper-trading training period
Initial operating period: 1–2 months without real capital.

During this period the system must research, generate strategies, validate them, paper trade, compare performance by market and regime, learn from failures, and maintain full audit trails.

Paper performance must not be treated as proof of future profitability.

## 15. Live trading readiness
Real trading is a gated phase. The production path is:
Paper trading → readiness review → Owner approves daily/session capital and risk envelope → limited capital → hard risk limits → autonomous monitored execution → post-trade review. Human approval is for the capital/risk envelope, not individual trades.

Once the Owner approves the active capital and risk envelope, Helix may enter, modify, hedge, and exit trades autonomously without waiting for trade-by-trade human approval. The independent risk engine may veto or halt any order, and the emergency kill switch can stop execution immediately.

A wallet or broker/exchange account is connected only after the software, security, risk, reconciliation, and monitoring layers are ready.

Workers never receive unrestricted private keys or unrestricted account authority. Secrets stay in a dedicated secure store. Execution is constrained by an independent risk engine and policy layer.

## 16. Market coverage
The platform should support a modular market adapter architecture covering crypto, equities, FX, commodities, futures, options, and other supported markets/data sources. Each market has its own data quality, latency, liquidity, and public-information limitations.

## 17. Required production architecture changes from current Helix
Move the authoritative organization state and heartbeat off the browser. Use a server-side persistent runtime, durable task/event queue, centralized database, worker execution services, isolated code/tool sandboxing, and auditable APIs. The browser becomes a control/observability interface rather than the runtime engine.

## 18. Non-negotiable safety and integrity requirements
- No guaranteed-profit claims.
- No automatic transition from paper to live trading.
- Risk engine can veto execution.
- High-risk actions require explicit policy/human gates.
- Full provenance for market data, research, and strategy results.
- Reproducible experiments and immutable result records.
- Idempotent jobs, retries, locks, and recovery after process failure.
- Monitoring for stale data, broken feeds, abnormal model behavior, and strategy drift.

## 19. Definition of done
Helix is considered ready for private paper-trading deployment when:
1. All 1,000 workers are instantiated with distinct specializations and policies.
2. Workers coordinate through durable shared state and events.
3. Source ingestion and provenance are operational.
4. Strategy lifecycle runs end-to-end with genuine backtests and independent validation.
5. Paper trading records real simulated orders, fills, costs, slippage, P&L, and risk metrics.
6. Smart-money/whale intelligence is integrated as evidence, not automatic trade commands.
7. Workers improve based on measurable experiments and failures.
8. Runtime continues when the browser is closed.
9. Security boundaries prevent worker code from reaching secrets or the host.
10. Live trading remains disabled until explicit readiness gates pass.

## 20. Personal-use intent
This is a private system for the owner’s own research and paper/live trading workflow. The product should be optimized for correctness, transparency, observability, experimentation, and safe capital controls rather than mass-market multi-tenant features unless later requested.

## 21. High-speed market observation and improving execution
Helix must separate **fast market reaction** from slower reasoning. The organization should target millisecond-class observation and deterministic pre-trade checks where the venue/data feed supports it, but must not pretend that an LLM can safely make every decision at millisecond latency.

The runtime is split into three loops:
- **Fast path (milliseconds):** market-data ingestion, timestamp validation, order-book/microstructure features, deterministic signal generation, hard risk vetoes, and order routing. No LLM/network round-trip is required for the critical path.
- **Tactical path (tens to hundreds of milliseconds, as infrastructure permits):** aggregation of fast signals, short-horizon strategy selection, execution adaptation, and cross-worker consensus using local/low-latency models only when the latency budget allows.
- **Strategic path (seconds to hours):** CEO reasoning, research, news interpretation, strategy generation, backtesting, learning, portfolio research, and worker coordination.

The fast path must have explicit latency budgets, stale-data detection, sequence-gap detection, circuit breakers, and an independent hard risk gate. Market observation latency and execution latency must be measured separately. “Millisecond-class” is a target engineering property, not a promise of profitability or of seeing every market event before other participants.

For genuine high-frequency deployment, the browser must never sit on the critical path. Market-data adapters, strategy execution, risk checks, and order routing must run server-side or in co-located low-latency infrastructure; the UI is observability/control only. High-level LLM workers continuously improve the strategies and parameterization used by the fast path, while the fast path remains deterministic and bounded.

Continuous improvement must optimize not just P&L but also latency-adjusted execution quality, slippage, fill rate, adverse selection, drawdown, turnover, data freshness, and model/strategy drift. Any live system retains hard daily capital limits and an emergency kill switch that can halt execution without waiting for a human approval message.


## 22. Open-source benchmark and capability inheritance

Research date: 2026-09-09

This registry records external open-source projects that Helix should study as capability benchmarks. It is a design/engineering reference, not a blanket permission to copy code. Before integrating source code, verify the upstream license and any dependency/data terms.

| Project | Benchmark capability | Helix treatment |
|---|---|---|
| TauricResearch/TradingAgents | Specialized LLM analysts, bull/bear debate, research manager, trader, risk debate, checkpoints/decision logs | Expand the pattern to 1,000 persistent specialists and a durable event network |
| Microsoft Qlib | Quant research, data/model pipeline, backtest, risk, portfolio, execution | Adopt/reimplement the research stack around Helix workers |
| Microsoft RD-Agent(Q) | Autonomous factor/model R&D and iterative co-optimization | Make iterative research a first-class worker workflow |
| QuantConnect LEAN | Event-driven algorithmic trading and alpha/portfolio/risk/execution model separation | Benchmark core trading-engine architecture |
| NautilusTrader | Production-oriented deterministic event-driven low-latency trading | Benchmark fast-path runtime and execution discipline |
| Hummingbot | Crypto exchange connectors, market making, arbitrage | Reuse connector/strategy patterns only after license review |
| Freqtrade | Crypto strategy lifecycle, dry-run, backtest, hyperopt | Adopt paper-trading and strategy-ops patterns |
| VectorBT | Massive parallel backtesting and parameter sweeps | Use as a research accelerator where license permits |
| FinRL | RL environments, portfolio allocation, ensemble/multi-agent research | Optional learning layer; never treat RL backtest as proof of profitability |
| TensorTrade | Composable RL environment/action/reward/data architecture | Borrow research abstractions and documented failure lessons |
| OpenBB | Broad financial data integration for analysts/quants/AI | Build source adapters and provenance layer around similar concepts |
| yfinance | Equity/market data and live WebSocket interface | Optional research adapter; obey data terms |
| CCXT | Unified crypto exchange REST/WebSocket APIs | Connectivity reference; prefer venue-native fast paths when required |
| Hyperliquid Python SDK | Venue-specific REST/WebSocket trading | Venue adapter reference for low-latency crypto execution |
| FinGPT | Finance-domain LLM research | Domain-model reference |
| FinRobot | Open financial agent platform | Financial-agent workflow reference |


## 23. Benchmark matrix and implementation rules

See `docs/TRADING_BENCHMARKS.md` for the current benchmark registry, scale correction, license/provenance rule, and required capability set.

## 24. Native tool building and tool factory
Helix must be able to build and maintain its own specialized trading tools when third-party tooling does not meet latency, provenance, safety, or functionality requirements. Native tools are first-class capabilities, not placeholders.

Initial native toolkit:
- `native.market.snapshot`: normalize order-book/market state, spread, imbalance, and freshness.
- `native.technical.signal`: deterministic fast-path technical features and baseline signals.
- `native.risk.check`: independent hard-limit order/position/daily-loss veto.
- `native.position.size`: deterministic stop-distance/risk-based sizing.
- `native.backtest`: reproducible backtests with fees and slippage.
- `native.strategy.score`: risk-adjusted promotion/rejection scoring.
- `native.paper.order`: realistic-enough first-stage paper fill simulation using bid/ask and fees.

Native tools generated by workers must be versioned, schema-defined, testable, provenance-tracked, sandboxed, and prohibited from accessing credentials, wallets, or unrestricted host resources. A worker may propose a tool; an independent test/QC path must verify it before deployment. Production execution tools remain behind the independent risk engine and venue policy layer.

## 25. Self-built research integrity and evolution tools
Helix must own deterministic primitives where external tools are insufficient. v0.6 adds:
- point-in-time validation to prevent look-ahead leakage;
- market-data integrity validation before backtests or paper trades;
- bounded strategy-genome mutation with provenance and reproducibility;
- portfolio-level gross, net, and concentration gates independent from LLM decisions.
These tools are first-class native capabilities and remain credential/wallet-free.

## 26. v0.6 research integrity and evolution implementation
The v0.6 implementation adds first-class deterministic tools for point-in-time data validation, data-quality gating, market replay, bounded strategy-genome mutation, and portfolio exposure checks. These primitives exist to make autonomous research auditable and to reduce look-ahead bias, bad-data contamination, uncontrolled strategy proliferation, and portfolio concentration.

## Project Continuity Rule (v1.17)
The authoritative continuity document is `docs/HELIX_Trading_Master_Spec_v1.17.docx`. Read it before resuming work. The project ZIP deliberately carries this DOCX so a fresh session can recover the mission, completed milestones, validation status, safety gates, and exact next implementation order. Update the DOCX after every substantive change.

Current code baseline: v0.24.
Next implementation order: source-specific adapters/parsers for permitted public macro, filings, market and news feeds with point-in-time provenance; model-backed worker reasoning behind the existing tool/policy boundary with durable reasoning provenance; genuine research/backtest/OOS/walk-forward/paper loop with experiment lineage; whale/smart-money ingestion; portfolio optimizer and champion/challenger system; low-latency execution; isolated worker sandbox; readiness-gated live execution.

## 21. v0.9 implementation record — real-time market adapters
- Added `src/trading/data/realtime.ts` with reconnecting live adapters for Binance combined `bookTicker` + `aggTrade` streams and Alpaca quote streams.
- Binance adapter normalizes venue events into Helix `MarketTick` records with bid/ask/size/last, exchange timestamp, receive timestamp, sequence, and venue classification.
- Alpaca adapter performs websocket auth/subscription and normalizes quote messages into `MarketTick`.
- Reconnect behavior uses bounded exponential backoff and stops cleanly on disconnect.
- WebSocket creation is dependency-injected for deterministic tests; production uses the runtime WebSocket implementation.
- Added `src/trading/data/realtime.test.ts`; both adapter tests pass.
- Official source references used for implementation: Binance WebSocket market streams and Alpaca real-time market data documentation.

## 22. v0.9 next engineering focus
1. Expand adapter coverage: Binance futures/spot variants, Kraken, Coinbase, and additional venue/feed adapters where terms and access permit.
2. Add persistent market-data recording with raw-event provenance and replay manifests.
3. Add a durable server event/queue layer so market ingestion and worker orchestration continue without the browser.
4. Add paper-order lifecycle realism: partial fills, order states, cancels/rejects, latency, slippage, and per-venue fee schedules.
5. Connect the 1,000-worker server runtime to event routing so specialist workers consume only relevant evidence/events.
6. Build whale/on-chain ingestion and entity attribution as a first-class evidence pipeline.


## 23. v0.10 implementation record — durable trading event boundary

Implemented the next foundational runtime step after v0.9.

- Added `migrations/0002_trading_event_journal.sql` with append-only `trading_event_journal` and query-friendly `trading_market_ticks` tables.
- Added `src/trading/runtime/journal.ts` with SQL-backed event persistence, raw market-tick recording, and in-memory test doubles.
- `ServerTradingRuntime` now persists market ticks before publishing them to the local event bus. Paper fills are persisted as durable events as well.
- Market tick IDs are deterministic and paper fills are keyed by `clientOrderId` so retry delivery is idempotent.
- `PaperExchange` now de-duplicates a repeated client order ID.
- Added focused durability/idempotency tests; 12/12 focused trading tests pass.
- Added `docs/TRADING_RUNTIME_DURABILITY.md`.

Known limitation: the durable journal is authoritative for events, but runtime/account snapshot recovery and a durable worker/task queue are still pending.

## 24. Next engineering focus after v0.10

1. Build durable queue/claim/lease semantics for server-side worker orchestration.
2. Add replay-manifest generation from persisted market-tick ranges and provenance hashes.
3. Add paper-exchange order lifecycle realism: open orders, partial fills, cancels/rejects, latency, slippage, venue fees, and mark-to-market risk.
4. Build runtime snapshot/projection recovery so server restarts reconstruct state from durable records.
5. Connect the 1,000-worker routing layer to persisted market/evidence events; browser becomes observability/control only.
6. Add whale/on-chain evidence ingestion after the durable pipeline is in place.
## 23. v0.11 durable worker task queue implementation record

Implemented a durable task-queue foundation for server-side worker orchestration:
- `trading_task_queue` migration with queued/running/completed/failed/dead-letter states.
- Priority ordering, delayed availability, bounded attempts, worker leases, heartbeats, error capture, and completion timestamps.
- PostgreSQL claim path uses row locking with `FOR UPDATE SKIP LOCKED` so multiple server workers can claim concurrently without taking the same task.
- Lease recovery returns abandoned running tasks to the queue until the attempt budget is exhausted, then dead-letters them.
- Deterministic task IDs make enqueue idempotent.
- In-memory queue implementation mirrors the production state machine for deterministic tests.
- `ServerTradingRuntime` now exposes the queue boundary through `enqueueWorkerTask(...)`; market-event routing into the 1,000-worker graph remains the next integration step.
- Event-to-task helper provides deterministic `task:<event-id>` mapping.

Verification:
- Trading-focused regression suite: 19/19 passing.
- Full repository test suite remains red only in the pre-existing `.grok`/OG checks because the archive does not contain `.grok/skills/og/SKILL.md` and `.grok/skills/og/references`.
- Typecheck remains blocked by missing installed type packages (`@types/node` and `vite/client`) in the working archive; no clean dependency install was available in this environment.
- Production SQL execution was not runtime-verified because the working archive has no installed `@electric-sql/pglite` package; the migration is written for PostgreSQL/PGLite semantics and is included in the source package for deployment validation.

## 24. v0.11 next implementation focus

1. Add a server-side worker supervisor that claims queue tasks, renews leases, records heartbeats, and performs retry/dead-letter handling.
2. Connect the queue to the exact 1,000-worker identity registry with deterministic worker routing and bounded per-worker concurrency.
3. Route durable market/news/macro/risk events into targeted worker tasks instead of broadcast-only in-memory delivery.
4. Add task-result persistence, provenance, worker performance counters, and task trace IDs.
5. Add authoritative restart/recovery tests that simulate process loss between claim, execution, and completion.
6. Keep all live trading disabled until the paper-trading and governance gates in the master spec are satisfied.



## 25. v0.13 deterministic replay-manifest implementation record

Implemented the deterministic replay/provenance layer over persisted market ticks.

- Extended `MarketTickRecorder` with bounded range queries that return `eventId` plus the normalized `MarketTick`.
- Added `src/trading/replay-manifest.ts` with `buildReplayManifest(...)` and `verifyReplayManifest(...)`.
- Manifest provenance covers the ordered persisted records, replay scope, tick count, first/last sequence, `dataHash`, and `manifestHash`.
- Replay ordering is deterministic by `exchangeTs`, `sequence`, then `eventId`; duplicate logical ticks are rejected.
- Added `docs/REPLAY_MANIFESTS.md` with the provenance contract and replay-manifest API.
- Added regression coverage for deterministic rebuilds, range filtering, tamper detection, duplicate rejection, and cross-symbol ordering.

Verification: **31/31 focused trading tests pass**. Clean typecheck remains blocked by the missing dependency tree in this working environment. Live trading remains disabled.

## 26. v0.14 realistic paper-order lifecycle implementation record

Implemented open/partially-filled/filled/cancelled/rejected order states; market and limit order handling; later-tick limit execution; liquidity participation and partial fills; configurable spread/slippage, fees, and latency; deterministic fill history and idempotent client order IDs. `ServerTradingRuntime` now advances pending paper orders on incoming ticks and marks open positions to market. Added `migrations/0006_trading_paper_orders.sql` and `docs/PAPER_EXECUTION.md`.

Verification: focused trading regression suite 47/47 passing. Clean typecheck/build remains blocked by the missing installed dependency tree. Live money remains disabled.

Known limitation: order/account state is still process-local; durable SQL order/fill projections exist but restart reconstruction is next.

## 27. Next engineering focus after v0.14

1. Runtime snapshot/projection recovery for cash, positions, risk state, pending orders, and event cursors.
2. Durable market/news/macro/risk evidence fan-out into targeted specialist tasks and councils.
3. Genuine research → backtest → OOS → walk-forward → paper-trading loop with experiment lineage.
4. Whale/smart-money ingestion, attribution, and entity history.
5. Portfolio optimizer + champion/challenger strategy system.
6. Low-latency execution path, isolated worker-code sandbox, readiness gates and controlled live execution.

## 27. v0.14 realistic paper-order lifecycle implementation record

Implemented open/partially-filled/filled/cancelled/rejected order states; market and limit order handling; later-tick limit execution; liquidity participation and partial fills; configurable spread/slippage, venue fee basis points, and latency; deterministic fill history and idempotent client order IDs. `ServerTradingRuntime` now advances pending paper orders on incoming ticks and marks open positions to market. Added `migrations/0006_trading_paper_orders.sql` and `docs/PAPER_EXECUTION.md`.

Verification: focused trading regression suite 47/47 passing. Clean typecheck/build remains blocked by the missing installed dependency tree. Live money remains disabled.

Known limitation: paper order/account state is still process-local; durable SQL order/fill projections exist but restart reconstruction is the next milestone.

## 28. Next engineering focus after v0.14

1. Runtime snapshot/projection recovery for cash, positions, risk state, pending orders and event cursors.
2. Durable market/news/macro/risk evidence fan-out into targeted specialist tasks and councils.
3. Genuine research → backtest → OOS → walk-forward → paper-trading loop with experiment lineage.
4. Whale/smart-money ingestion, attribution, and entity history.
5. Portfolio optimizer + champion/challenger strategy system.
6. Low-latency execution path, isolated worker sandbox, readiness gates and controlled live execution.

## 29. v0.16 durable evidence fan-out and multi-round debate implementation record

Implemented the evidence/council layer that turns durable research signals into targeted specialist work and persistent adversarial debate.

- Added `src/trading/evidence.ts` with provenance-rich evidence packets, deterministic content hashes, idempotent in-memory/SQL stores, and bounded specialist fan-out.
- Added `src/trading/debate.ts` with explicit trading councils, balanced specialist participant selection, sequential debate rounds, durable turn records, challenge links, confidence bounds, minimum-turn close gating, and explicit final decisions with rationale.
- Added `migrations/0008_trading_evidence_debate.sql` for evidence packets, worker fan-out records, debate sessions, rounds, and turns with uniqueness constraints for delivery and turn idempotency.
- Added `docs/EVIDENCE_AND_DEBATE.md` documenting the durable evidence/debate contract.
- Fixed an existing SQL queue `peek()` defect that incorrectly referenced the in-memory task map instead of the database-backed queue; SQL queue inspection now uses a deterministic ordered query.
- Expanded councils to include Macro, Fundamental, Technical, Quant, Derivatives, Crypto, News & Event, Strategy Lab, Risk, Execution, Adversarial Research, and Evidence/Knowledge.
- Added deterministic `evidence.review` and `debate.turn` task identities so retries do not create duplicate specialist work.

Verification: **47/47 focused trading tests pass**, including the new evidence/debate suites plus worker supervision, snapshots, paper execution, durable journal, replay manifests, realtime adapters, replay, and strategy evolution.

Clean application typecheck/build remains blocked in this environment because the installed dependency tree is incomplete. Live money and production wallet execution remain disabled.

## 30. Next implementation order after v0.16

1. Connect evidence/debate outputs to real source ingestion and worker execution, including evidence-aware turn prompts/results rather than only orchestration records.
2. Build the genuine research -> backtest -> out-of-sample -> walk-forward -> paper-trading loop with experiment lineage and strategy promotion/retirement.
3. Add whale/on-chain ingestion, entity attribution, exchange flows, and positioning evidence.
4. Add portfolio optimization, strategy ensemble/champion-challenger selection, and risk attribution.
5. Harden low-latency execution, worker sandboxing, security/egress controls, readiness gates, and only then controlled live execution.


## 31. v0.17 source ingestion and worker execution bridge

Implemented the first executable bridge from external research evidence into the 1,000-worker runtime.

- Added `src/trading/data/source-ingestion.ts` with an explicit HTTP JSON source adapter, host allowlisting, timeout/size limits, redirect rejection, and private/local-host protections.
- Added `SourceEvidenceIngestor` and `SourceEvidencePipeline` so permitted source data becomes provenance-rich evidence packets and deterministic specialist review tasks.
- Added `src/trading/runtime/worker-execution.ts` with capability-bound trading tools, structured reasoning traces, evidence review, debate-turn execution, durable result provenance, and policy enforcement before tool invocation.
- Registered the public JSON source family in the market-data registry.
- Added source-ingestion and worker-execution regression suites and updated the package test script.

Verification: **55/55 focused trading tests pass**, including source ingestion, evidence/debate, worker execution/supervision, snapshots, paper execution, durable journal/queue, replay manifests, realtime adapters, replay, and strategy evolution.

Known limitation: the current reasoning provider is deterministic scaffolding, not a production model-backed reasoning system. No production public endpoint is enabled by default; real source adapters require explicit endpoint/allowlist configuration and provider terms/access verification. Clean application typecheck/build remains blocked by the incomplete dependency tree in the provided environment. Live money remains disabled.

## 32. Next implementation order after v0.17

1. Add source-specific adapters/parsers for permitted public macro, filing, market, and news feeds with point-in-time publication/availability provenance.
2. Replace deterministic worker reasoning scaffolding with model-backed local/provider reasoning behind the same capability and tool-policy boundary, with durable reasoning provenance.
3. Build the genuine research → backtest → out-of-sample → walk-forward → paper-trading loop with experiment lineage and strategy promotion/retirement.
4. Add whale/on-chain ingestion, entity attribution, exchange flows, and positioning evidence.
5. Add portfolio optimization, strategy ensemble/champion-challenger selection, and risk attribution.
6. Harden low-latency execution, worker sandboxing, security/egress controls, readiness gates, and only then controlled live execution.

## 33. v0.18 risk-gating hardening

Hardened the independent paper-trading risk boundary so configured leverage and drawdown limits are enforced as hard vetoes.

- Extended `nativeRiskCheck()` with portfolio exposure, projected leverage, and high-water-mark drawdown calculations.
- Added runtime `peakEquity` state with snapshot persistence and backward-compatible recovery.
- Included open and partially-filled paper-order exposure when approving new market and limit orders.
- Updated worker `risk.check` inputs to carry the optional exposure/high-water-mark context through the capability boundary.
- Added regression tests for portfolio leverage, hard drawdown, pending limit-order accumulation, and runtime drawdown vetoes.

Verification: the changed trading runtime/risk subset passes. The broader trading-focused direct-Node invocation has one known environment/test-runner failure in `src/runtime/runtime.test.ts` because `@/lib` is unresolved outside the normal application runner. The full repository test command remains non-green because unrelated `.grok`/platform tests reference skill files omitted from the package snapshot.

Clean typecheck/lint/build remain unverified because the dependency tree is not installed. Live trading remains disabled.

## 34. Next implementation order after v0.18

1. Source-specific point-in-time adapters for official macro, filings, market, and news feeds.
2. Model-backed worker reasoning behind the existing capability/tool-policy boundary.
3. Immutable research -> backtest -> OOS -> walk-forward -> paper lifecycle with strategy promotion/retirement.
4. Whale/on-chain and public positioning intelligence.
5. Portfolio optimization and champion/challenger governance.
6. Worker sandbox, low-latency hardening, security/egress controls, readiness gates, and only then controlled live execution.

### v0.19 Source-Specific Point-in-Time Data Layer

Implemented source-specific public-data adapters for FRED/ALFRED observations, SEC EDGAR submissions, and Alpha Vantage news/sentiment. Each adapter normalizes source timestamps into Helix `eventTs` / `publishedTs` / `availableTs` and rejects records not available at the requested research `asOfTs`. Adapter identities are registered in the data-source registry with explicit PIT capability metadata. External credentials/provider terms remain deployment concerns; live trading remains disabled.


## v0.23 — Phase 1 Completion Record

Phase 1 is complete across durable smart-money storage/source fetch policy, paper post-trade attribution and strategy performance snapshots, CEO plan reconciliation, worker sandbox/egress controls, and fail-closed live-readiness gates. Trading-focused verification: 88/88 PASS. Typecheck remains environment-blocked by the absent dependency/type-definition tree. Live trading remains disabled.


## 35. v0.24 Phase 1 audit remediation

Implemented the full remediation pass after an independent Phase 1 audit.

- Added explicit on-chain, SEC 13F information-table, and CFTC COT source fetch adapters with PIT-aware availability semantics.
- Added durable SQL/in-memory strategy performance snapshot stores and wired paper post-trade completion to performance persistence.
- Corrected post-trade slippage accounting by retaining benchmark/touch prices so slippage is not double-counted.
- Strengthened CEO plan reconciliation to cancel stale queued/planning work and rebuild desired dependencies.
- Hardened worker execution with Node permission controls, bounded workspace access, IPC-brokered allowlisted network access, and fail-closed legacy `code.run` / `web.fetch` behavior.
- Replaced caller-forged readiness booleans with structured runtime facts and an authoritative fail-closed `ServerTradingRuntime.readinessReport()` integration.
- Cleaned migration numbering and added duplicate-sequence/name detection plus Phase 1 schema hardening.

Verification: **96/96 trading-tree tests pass** and migration-plan checks pass **8/8**. Source tree count: **21,333 lines** across counted TypeScript/TSX/JavaScript/JSX files. Typecheck remains blocked only by the absent installed dependency/type-definition tree in the working archive. Live trading remains disabled.

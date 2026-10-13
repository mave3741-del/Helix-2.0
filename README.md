# Helix Trading Intelligence

Private trading-focused AI Organization OS. One Owner. One Trading CEO. 1,000 coordinated trading specialists.

Helix is a trading research and paper-trading organization — not a chatbot and not a bag of independent agents. The organization is the intelligence: 1,000 specialized workers coordinate through shared evidence, memory, experiments, risk controls, and performance history. **Live trading execution is disabled by design** — see "Trading mission" and "Current operationalization status" below.

## Quick start

You already have this folder (or a zip of it) — there's nothing to download from a release page. Requires [Node.js 22.x](https://nodejs.org).

**Desktop app (recommended)** — opens HELIX as its own window, not a browser tab:

```bash
./desktop.sh      # Mac/Linux
desktop.bat       # Windows — double-click, or run from a terminal
```

**Browser, for day-to-day development:**

```bash
./start.sh        # Mac/Linux
start.bat         # Windows — double-click, or run from a terminal
```

Both of these run `npm run setup` for you the first time (checks your Node version, installs dependencies, prepares the database) and then start HELIX — nothing to configure by hand. If you'd rather run the steps yourself:

```bash
npm install
npm run setup   # one-time: checks Node version, installs deps, preps the db
npm run dev     # browser, http://localhost:8080
# or
npm run desktop # desktop app window
```

No `.env` file or API keys are needed to get HELIX running. Every brain/voice provider key (NVIDIA NIM, OpenAI, ElevenLabs, ...) is entered once inside the running app under **Settings → Brains** and stored server-side — never in a config file. See `.env.example` only if you want to point at a real Postgres database instead of the built-in embedded one.

See [START-HERE.txt](./START-HERE.txt) for more on the UI itself, and [REPORT.md](./REPORT.md) for the fuller project report.

## What it is

- **Owner** sets mission, objectives, capital budgets, and risk policies
- **CEO** plans, delegates, and reports through BrainRuntime
- **8 executives / 12 departments / supervisors / 1,000 workers**
- Provider-agnostic brains (xAI, OpenAI, Anthropic, Gemini, OpenRouter, Groq, local Ollama / LM Studio / llama.cpp)
- Owner-managed API keys (never shown after save)
- Routing modes: Auto / Hybrid / Cloud first / Local only
- Authorized workspace tools (files, node, fetch) — not an unrestricted shell
- Independent **QC / testing / security** gates
- Organizational **memory**, **skill factory**, **governance**, **recovery**
- 18 built-in **acceptance scenarios**

Honest labels: implemented / configured / connected / runtime-verified. 1,000 identities are not 1,000 simultaneous LLM sessions.

## Trading mission

This build is being transformed into a private trading-intelligence organization. The 1,000-worker registry is assigned trading specializations across macro, fundamentals, quant, technicals, derivatives, crypto/on-chain, smart-money/whale intelligence, news, strategy research, validation, risk, execution, adversarial research, and learning.

The authoritative current handoff is `PROJECT-MASTER-FILE.txt`; the current engineering baseline is v0.99.25 / Master v1.94 with Phase 10.8 RL research complete plus full-project risk/accounting hardening. Live execution remains disabled.

### Current code size (v0.99.25)
Source measurement is maintained by the fixed extension rule; the latest Master records 43,064 source lines across 421 source files. Live execution remains disabled.

## Current operationalization status (v0.98)
The current implementation is beyond the historical Phase-2 connector milestone. v0.89 hardened the Phase-1-to-Phase-5 runtime boundary: direct Node networking is denied inside worker sandboxes; broker submission is reconciled and never blindly failed over after an indeterminate POST; quorum counts independent providers rather than feed IDs; deployment isolation is backed by a concrete container manifest. v0.94 adds certification consistency hardening and enforces the Phase 6 gate in CI. The unified `npm run phase6:certify` passes the local engineering gates; actual external staging, real Postgres, real connector permissions, deployment-host sandbox probing, and independent human review remain explicitly pending. Live execution remains disabled.


## Brains

| Brain | Role |
|---|---|
| Grok 4.5 | Flagship reasoning / CEO strategy |
| Grok Fast | Low-latency structured work |
| Cloud Coder | Implementation and tests |
| Open Reasoner | Free-tier research and drafting |
| Local models | Ollama, LM Studio, llama.cpp |
| Local Heuristic | Always-on deterministic fallback |

A down brain is not an organizational failure. Fallback preserves task state.

## Stack

TanStack Start, React 19, Tailwind v4.

Auth is off by default. Two layers of persistence: lightweight org/UI state uses Zustand + browser storage, while trading runtime state (paper account, positions, fills, snapshots) is backed by a real embedded database (PGLite, Postgres-compatible) that survives restarts — or a real Postgres instance if `DATABASE_URL` is set. See `.env.example`.

## High-speed trading architecture

Helix uses a three-speed design: a millisecond-class deterministic fast path for fresh market events and hard risk checks, a tactical path for short-horizon signal aggregation, and a strategic AI path for research, news, strategy evolution, and long-horizon decisions. LLM calls are deliberately kept off the critical millisecond execution path. The target is fast, measurable market observation and execution—not guaranteed profit or an “unbeatable” system.

## Open-source benchmark baseline

Helix is benchmarked against TradingAgents, Microsoft Qlib/RD-Agent(Q), QuantConnect LEAN, NautilusTrader, Hummingbot, Freqtrade, VectorBT, FinRL, TensorTrade, OpenBB, yfinance, CCXT, Hyperliquid's SDK, FinGPT and FinRobot. The goal is to combine the strongest capability patterns without blindly copying upstream code. See `docs/TRADING_BENCHMARKS.md` and `docs/IMPLEMENTATION_ORDER_V0_4.md`.

## Native Trading Tools

Helix owns a bounded native tool layer for low-latency observation, technical features, hard risk checks, position sizing, backtesting, strategy scoring, paper fills, RSI, ATR, z-score, whale/flow evidence, and regime classification. Workers may propose new tools through approved templates; generated tools are versioned, schema-defined, tested, and have no credential or wallet access.

Helix Trading Intelligence v0.6: native research-integrity, strategy-evolution, and portfolio-risk primitives added.

## Phase 5.18-5.25
Phase 5 is engineering-complete through 5.25. The control plane includes execution reconciliation, broker failover hardening, market-data health/quorum, observability, deployment sandbox enforcement, Command Room trading integration, voice/multi-agent runtime, and controlled readiness/canary gates. Live execution remains disabled pending external production certification.
## Phase 6 status
Phase 6.1-6.8 engineering controls are implemented, Phase 7.1-7.5 paper operations/recovery/canary/review layers are implemented, and Phase 8 is now engineering-complete; external certification remains explicitly gated on real target-environment evidence. Run `npm run phase6:certify` and `npm run phase7:preflight` for unified local gates. Real external staging evidence is still required for production/live certification; live execution remains disabled.



## Current release

**v0.99.25 — Certification/test-pipeline remediation after Phase 10.8 reinforcement-learning research capability.** Live execution remains DISABLED. A sealed external certification bundle is created only after real external certification PASS evidence exists.

## Phase 8.1 — External certification
The source tree now contains a reproducible `npm run external:certify` gate that requires real staging evidence before running the full external certification chain. It runs the clean CI/toolchain gates, real Postgres migration/schema/immutability checks, and deployment sandbox contract verification, then writes a secret-safe evidence manifest. Missing external evidence is reported as BLOCKED; it does not silently substitute PGLite or local rehearsal state.

## Phase 8.3 — Direct-command dependency guard
Direct `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`, and `npm run db:smoke` commands now invoke the dependency-integrity gate first. A partial or missing dependency tree is therefore reported as a certification blocker instead of an application/tooling failure.



## Phase 8.5 — Durable Event-to-Worker Routing
The server trading runtime now bridges an allowlisted set of strategic/tactical events into the durable worker task queue. Risk alerts receive the highest routing priority, followed by market-moving news, macro releases, regime changes, strategy signals/reviews, general news, and paper-fill events. Raw `market.tick` events are intentionally excluded from the default worker-routing allowlist so the low-latency path is not flooded by research work. Routing uses deterministic `event-task:<event-id>` task IDs and the existing idempotent queue semantics; event publication awaits the durable enqueue operation.

## Phase 8.4 — External Evidence Replay Verification

`npm run external:evidence:verify` validates a saved Phase 8.1 certification evidence artifact without rerunning external infrastructure. It verifies schema/gate identity, structural safety, forbidden credential-shaped keys, execution-step uniqueness/status, and the deterministic SHA-256 evidence hash. This is a replay-integrity check only and cannot grant live-trading authority.


### Phase 8.8
External certification now requires signed deployment attestation and a bounded connector staging probe.


### Phase 9.4 — Independent reviewer decision controls
Current release: v0.99.8. Reviewer decisions are bounded by expiry, hashed, and persisted through an append-only approval ledger. Live execution remains disabled.


## v0.99.22 — Phase 10.6
Governed crypto strategy capability contracts: market-making, arbitrage, trend and mean-reversion research modes; paper/dry-run only; bounded optimization; venue-admission dependency; cost/slippage/walk-forward/overfit evidence; hard position/notional/daily-loss limits. Live execution remains disabled.


## Phase 10.7 — Vector Research Acceleration
HELIX includes a native, dependency-free bounded vector research layer for large parameter evaluations, deterministic experiment hashing, OOS/walk-forward/paper stages, and anti-overfitting promotion gates.

## Phase 10.8 — Reinforcement-Learning Research Capability
HELIX includes an optional native RL research contract inspired by FinRL/TensorTrade patterns. Observation/action spaces, reward policies, episode budgets, seed stability, OOS readiness, drawdown, turnover, provenance and paper-execution controls are explicitly governed. RL research cannot enable live trading.

## JARVIS-style command room (v0.99.25)

The default command surface now behaves as a JARVIS-style HELIX control room. Orion is the primary command identity; the UI does not use the generic CEO label.

Named identities: Orion, Lyra, Nova, Atlas, Polaris, Nebula, Titan, Cassini, Astra, Mira, Selene.

Voice input, spoken replies, Brain/provider routing, NVIDIA NIM configuration, bounded specialist councils, governance actions, and governed self-improvement objectives all enter the same HELIX orchestration path. The browser remains a control/observability surface; live trading remains structurally disabled in this release.

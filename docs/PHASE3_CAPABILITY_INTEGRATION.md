# HELIX Phase 3 Capability Integration

This phase combines high-value patterns from mature trading-agent systems without weakening HELIX's fail-closed architecture.

## Integrated capabilities

- AutoResearch Factory: factor discovery, hypothesis queue, reproducible artifacts, leakage guard, sensitivity, bootstrap and multiple-testing-aware promotion evidence.
- Execution Intelligence: venue scoring, TWAP/VWAP-style slicing, expected slippage, queue-risk estimation and execution-quality attribution.
- Market Simulation Lab: latency, spread, liquidity, correlation, exchange-outage and partial-fill stressors.
- Decision Ledger: durable decision identity, evidence references, model/provider metadata and post-trade outcome linkage.

## Architectural rule

Agents can propose hypotheses, rank opportunities and explain decisions. Deterministic HELIX services remain authoritative for evidence validity, research windows, portfolio/risk gates and execution state.

## Promotion rule

A profitable-looking result is not sufficient. Candidate strategies still require chronological train/test separation, existing OOS/walk-forward/statistical gates, champion governance, and paper validation.

## Live boundary

This phase adds no live trading capability. Live execution remains disabled and no production wallet or private execution credential is introduced.

## Phase 3B — Research/data/operations hardening

Added:
- multi-source Data Quorum with freshness, PIT/future-data rejection, quality floor and disagreement gate;
- RL research lane for PPO/SAC/TD3/A2C/DDPG trials behind OOS, drawdown and turnover gates;
- contamination-resistant benchmark harness that evaluates agents against stressed execution scenarios;
- operations watchdog with deterministic normal/degraded/halted modes and safe degradation controls.

No module can enable live execution or bypass existing evidence, portfolio or readiness gates.


## Phase 3C — Authoritative pipeline wiring

Added the `Phase3TradingPipeline` coordinator. Candidate assessment now has one deterministic integration boundary for:
- point-in-time candidate timestamp validation;
- Data Quorum acceptance/rejection;
- watchdog normal/degraded/halted policy;
- Decision Ledger identity/evidence recording;
- benchmark score review before an agent family is considered eligible.

Added migration `0017_phase3_agent_lineage.sql` for durable agent decision and execution attribution records. Existing research experiment schema remains owned by migration `0011_trading_research.sql`.

A regression was fixed in `DecisionLedger.list()`: passing `structuredClone` directly to `Array.map` could pass the array index as the structured-clone options argument under Node's runtime API. The list operation now wraps the clone call explicitly.

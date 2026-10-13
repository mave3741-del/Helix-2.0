# Helix Trading Intelligence v0.4 — implementation order

The external benchmark review changes the build order. Do not add random features until these layers exist in this order:

1. Durable server runtime and event/task queue; browser is observability/control only.
2. Market data gateway with WebSocket-first feeds, timestamps, sequence/gap detection, staleness alarms, and normalized events.
3. Fast deterministic path for feature extraction, microstructure signals, risk vetoes, and execution routing.
4. Quant research engine with genuine backtests, costs, slippage, walk-forward and out-of-sample isolation.
5. Worker research network with durable evidence, hypotheses, experiments, and specialist debate.
6. Strategy evolution loop inspired by RD-Agent/Qlib: propose -> implement -> test -> reject/promote -> create next experiment.
7. Paper-trading exchange simulator with realistic fills and latency.
8. Smart-money/whale and institutional intelligence as evidence inputs, not direct trade commands.
9. Portfolio/risk engine with hard limits independent of AI reasoning.
10. Venue adapters (crypto first where low-latency data/connection is available) and later other asset classes.
11. Live-trading gate: owner approves a capital/risk envelope for a session/day; no trade-by-trade approval.
12. Native tool factory: build missing bounded trading/research tools in-house; version, test, benchmark and register them.
13. Post-trade attribution and learning: every fill updates strategy, worker, execution and risk metrics.

## v0.6 research integrity and evolution layer

Added native, deterministic primitives that make the 1,000-worker research loop more rigorous:
- point-in-time validation to reject information unavailable at an as-of timestamp;
- market-bar data quality checks for duplicates, invalid OHLC and volume anomalies;
- bounded reproducible strategy-genome mutation for research experiments;
- portfolio gross/net/concentration checks independent of LLM reasoning;
- these capabilities are exposed through the native tool factory and remain credential/wallet-free.

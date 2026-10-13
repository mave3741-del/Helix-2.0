# Helix Trading Intelligence — Open-source benchmark registry

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

## Scale correction

TradingAgents is highly visible but is not a 120,000-code-line codebase in the publicly measured snapshot used for this design. An Aug 10 2026 SLOC report counted 17,514 total lines and 13,122 code lines across 144 files. Helix v0.3 currently contains about 14,218 counted code lines across 106 source files. Therefore Helix should not compete on raw line count; it should compete on **capability breadth, correctness, runtime persistence, data coverage, experiment quality, and integration depth**.

## Required Helix benchmark capabilities

1. Multi-agent debate and specialization from TradingAgents.
2. Quant R&D and factor/model evolution from Qlib/RD-Agent(Q).
3. Event-driven backtest/live separation from LEAN.
4. Low-latency deterministic execution discipline from NautilusTrader.
5. Crypto connector/market-making/arbitrage patterns from Hummingbot and Freqtrade.
6. High-throughput research/backtesting from VectorBT.
7. RL research environments from FinRL/TensorTrade.
8. Multi-source financial-data integration from OpenBB/yfinance.
9. Unified exchange connectivity from CCXT plus venue-native SDKs.
10. Finance-domain language/agent patterns from FinGPT/FinRobot.

## License and provenance rule

Helix must never blindly copy upstream code. For every imported component record: upstream repository, commit/version, license, dependency licenses, modifications, provenance, security review, test evidence, and data rights/terms.

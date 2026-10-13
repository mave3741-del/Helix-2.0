# Realistic Paper Execution — v0.14

Helix v0.14 upgrades the paper exchange from a single immediate-fill model to an order-lifecycle simulator suitable for research and paper-trading validation.

## Order lifecycle

Orders now support `open`, `partially_filled`, `filled`, `cancelled`, and `rejected` states. Limit orders remain open until the current quote crosses the limit. Open orders can consume available displayed liquidity across later market ticks.

## Execution realism

The simulator models:

- bid/ask touch selection for marketable orders;
- configurable base slippage in basis points;
- spread-derived execution cost;
- configurable venue fee basis points;
- configurable latency applied to immediate execution timestamps;
- liquidity participation limits to produce partial fills;
- per-order fill history;
- deterministic client-order and fill identifiers;
- idempotent repeated client-order submissions.

## Runtime integration

`ServerTradingRuntime` now exposes `paperLimitOrder()` and `cancelPaperOrder()`. Each accepted market tick marks open positions to market, then advances open paper orders against that tick. Generated fills are persisted through the existing durable trading-event journal boundary.

## Integrity boundary

Paper execution remains simulated. No exchange account, wallet, or private key is touched by this layer. Live execution remains disabled and must remain behind the readiness gates defined by the master specification.

## Current limitation

The order lifecycle is implemented in the process-local `PaperExchange`. The SQL migration `0006_trading_paper_orders.sql` defines durable order/fill storage for the next persistence projection step, but this milestone does not yet rebuild the full paper account from that database on restart. Runtime cash/position/risk snapshot recovery remains the next milestone.

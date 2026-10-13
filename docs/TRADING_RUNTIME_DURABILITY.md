# Trading runtime durability — v0.10

## What changed

Helix now has a durable-event boundary between market ingestion / paper execution and the in-process event bus.

- `trading_event_journal` is the append-only authoritative event log. Event IDs are unique and inserts are idempotent.
- `trading_market_ticks` is a query-friendly projection of raw normalized market ticks with exchange/receive timestamps, sequence, quote fields, and the original JSON payload.
- `SqlTradingEventJournal` and `SqlMarketTickRecorder` use the existing server-only SQL boundary (`Neon` when configured, `PGLite` for local preview).
- The runtime keeps the local event bus for low-latency subscribers, but persistence happens before publication.
- Market-tick IDs are deterministic from venue/symbol/exchange timestamp/sequence, and paper-fill IDs use `clientOrderId`, making retry delivery idempotent.
- `PaperExchange` now de-duplicates a repeated `clientOrderId` so a retry cannot create a second fill.

## Recovery boundary

The journal is now the durable source of trading events, but full account-state recovery is not complete yet. A future runtime snapshot / projection layer must rebuild paper positions, cash, risk state, and worker orchestration from the journal before unattended server restart is considered production-ready.

## Verification

Focused tests: 12/12 pass using Node's TypeScript stripping runner. Full project typecheck/build is currently blocked in this environment because installed dependencies are absent (`@types/node`, Vite client types, and package runtime modules such as PGLite are unavailable).

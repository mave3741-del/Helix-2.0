# HELIX Closed-Loop Operations

The closed-loop paper-learning layer is intentionally bounded. It can update portfolio allocations and produce lifecycle recommendations from completed paper/post-trade outcomes, but it does not mutate strategy code or enable live execution.

## Runtime wiring

`RuntimeClosedLoopService` binds a paper `ServerTradingRuntime` to `ClosedLoopScheduler`. The service is not started automatically. Operators must explicitly start it after the normal readiness/data/security controls are satisfied.

Each scheduled cycle collects durable in-memory runtime paper trades, configured strategy profiles, realized return/risk summaries and the current learning policy. The cycle is persisted through `ClosedLoopStore`; production defaults use `SqlClosedLoopStore`.

## Safety invariants

- Paper mode only; construction rejects non-paper runtime state.
- Minimum cycle interval is bounded to 1 second or more.
- Overlapping cycles fail closed instead of running concurrently.
- Decisions are persisted with a deterministic SHA-256 decision hash.
- Existing cycle IDs are immutable at the SQL layer (`ON CONFLICT DO NOTHING`).
- Strategy code is never changed by the learning loop.
- Live execution remains disabled.

## Validation

The deterministic multi-cycle simulation covers trend, range, high-volatility and liquidity-stress regimes across four cycles. It verifies bounded allocation turnover, weak-strategy retirement behavior and absence of unexpected fail-closed cycles under the configured baseline policy.

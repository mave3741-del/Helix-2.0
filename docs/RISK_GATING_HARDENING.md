# Risk-Gating Hardening — v0.18

Helix v0.18 hardens the independent paper-trading risk boundary so the configured risk limits are enforced rather than merely carried as configuration.

## Implemented

- `nativeRiskCheck()` now enforces portfolio leverage using existing portfolio/pending-order exposure plus the candidate order.
- `nativeRiskCheck()` now enforces maximum drawdown from a persisted equity high-water mark.
- `ServerTradingRuntime` persists and restores `peakEquity`, with backward-compatible recovery for older snapshots that do not contain the field.
- Market and limit order gates include pending open/partially-filled order exposure for position and leverage decisions.
- Worker `risk.check` accepts optional `existingGrossExposureNotional` and `peakEquity` inputs so the capability boundary can use the same hard risk rules.

## Regression coverage

Added tests for:

- portfolio leverage across otherwise individually valid positions;
- drawdown veto at the high-water-mark threshold;
- multiple pending limit orders exceeding the position cap;
- runtime rejection after paper-equity drawdown breaches the configured limit.

## Verification

The changed trading runtime/risk subset passes. The broader trading-focused invocation has one pre-existing test-runner/environment failure in `src/runtime/runtime.test.ts` because the source alias `@/lib` is not resolved by direct Node type-stripping execution.

The full repository test command remains non-green because the archive intentionally carries unrelated platform/`.grok` tests whose referenced skill files are absent from the package snapshot.

Clean typecheck/lint/build remain unverified because the dependency tree is not installed in the supplied workspace.

Live trading remains disabled.

## Next implementation order

1. Source-specific point-in-time adapters for official macro, filings, market, and news feeds.
2. Model-backed worker reasoning behind the existing capability/tool-policy boundary.
3. Immutable research → backtest → OOS → walk-forward → paper lifecycle with promotion/retirement.
4. Whale/on-chain and public positioning intelligence.
5. Portfolio optimization and champion/challenger governance.
6. Worker sandbox, low-latency hardening, security/egress controls, readiness gates, and only then controlled live execution.

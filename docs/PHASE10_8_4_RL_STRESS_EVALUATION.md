# HELIX Phase 10.8.4 — RL Stress / Adversarial Evaluation

## Status
Engineering implementation complete for v0.99.24.

## Scope
Phase 10.8.4 adds a deterministic stress-evaluation contract around the RL research lane. It tests candidates against five controlled adversarial scenarios:

1. regime shift
2. volatility spike
3. degraded data
4. transaction-cost shock
5. liquidity shock

## Safety properties
- Input bars are copied and chronologically normalized; source data is not mutated.
- Non-finite source bars fail closed.
- Degraded-data scenarios are rejected before the evaluator runs unless an explicit research-only policy allows them.
- Non-finite evaluator metrics reject the scenario.
- Transaction-cost shock multiplies configured fee/slippage assumptions by 4x.
- Promotion uses scenario pass-rate, worst return, worst drawdown and worst Sharpe gates.
- Results receive a deterministic SHA-256 evidence hash.
- This capability is research/evaluation only and does not enable live execution.

## Verification
Focused Phase 10.8.4 plus prior RL/OOS regression suite: **14/14 PASS**.

This is an engineering gate, not a claim of profitable trading performance or production/live-trading readiness.

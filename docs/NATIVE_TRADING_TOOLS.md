# Helix Native Trading Tools

Helix may create native tools instead of depending entirely on external projects.

## Principles
- Fast-path tools must be deterministic and bounded.
- Research tools must be reproducible.
- Risk tools must be independent from strategy/LLM reasoning.
- Generated tools must run without credentials or wallet access.
- Every tool has an explicit schema, version and test evidence.
- Third-party integrations remain useful where they provide superior venue/data coverage, but Helix owns the decision/risk layer.

## Initial native toolset
`native.market.snapshot`, `native.technical.signal`, `native.risk.check`, `native.position.size`, `native.backtest`, `native.strategy.score`, `native.paper.order`.

## Worker-created tool lifecycle
PROPOSE → SCHEMA → IMPLEMENT → SANDBOX TEST → INDEPENDENT QC → BENCHMARK → APPROVE → DEPLOY → MONITOR → ROLLBACK.

Generated tools may not access production secrets, private keys, wallets, unrestricted shell, or unrestricted network access. Live trading connectors remain separate from generated research tools.

## Worker-created tools
Workers can propose a native tool using an approved template. Current bounded templates include RSI, ATR, rolling z-score, whale/flow evidence scoring, and regime classification. The factory records an explicit schema/version and does not grant credentials, wallet access, or unrestricted host/network access.

## v0.6 native additions
- `native.pit.validate`: rejects look-ahead data at a chosen as-of time.
- `native.data.quality`: validates bar integrity before research.
- `native.strategy.mutate`: reproducible bounded strategy evolution primitive.
- `native.portfolio.check`: independent portfolio exposure and concentration gate.

These are research/risk primitives only; none has production wallet access.

## Current v0.6 native research integrity toolkit
The native toolkit now also includes:
- `native.pit.validate`
- `native.data.quality`
- `native.strategy.mutate`
- `native.portfolio.check`

These tools support point-in-time integrity, dataset hygiene, reproducible strategy evolution, and portfolio risk gates. They do not execute live orders.

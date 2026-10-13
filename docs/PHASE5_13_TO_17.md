# HELIX Phase 5.13–5.17 — Risk, Liquidity, Admission, Audit, Control Plane

This bundle adds five integrated production/research layers around the Phase 5 adaptive-learning loop.

## 5.13 — Regime-aware risk budget
`src/trading/portfolio/risk-budget.ts` converts equity, hard exposure limits, cash reserve, and a regime multiplier into deterministic gross/net/strategy risk budgets. Stress regimes can only reduce the budget.

## 5.14 — Liquidity-aware sizing
`src/trading/execution/liquidity-sizing.ts` caps desired order quantity by top-of-book participation, risk capital, and execution-quality throttle. It never increases size above the requested quantity.

## 5.15 — Learning admission gate
`src/trading/learning/learning-admission.ts` turns paper-observation evidence plus upstream health into an explicit fail-closed learning admission decision.

## 5.16 — Learning audit ledger
`src/trading/learning/learning-audit-ledger.ts` creates a hash-linked learning-cycle audit chain. Migration `0028_phase5_control_plane.sql` provides durable storage.

## 5.17 — Unified Phase 5 control plane
`src/trading/phase5-control-plane.ts` combines risk budgeting, liquidity sizing, paper-observation admission, the adaptive learning cycle, and the audit entry into one deterministic boundary. It fails closed when observation/health/liquidity or the learning cycle is not acceptable.

Live trading remains disabled.

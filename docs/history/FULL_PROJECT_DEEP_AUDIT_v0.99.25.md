# HELIX Trading Intelligence — Full-Project Deep Audit v0.99.25

## Scope
Fresh end-to-end audit of the complete extracted project baseline after Parts 1–3.

Canonical code measurement under the fixed source-extension rule (`.ts .tsx .mts .mjs .js .jsx`, excluding `node_modules`, `dist`, `build`, `coverage`, generated `routeTree.gen.*`): **452 source files / 44,328 source lines**.

## Confirmed findings fixed in this audit

1. **Risk-budget bypass on limit orders — HIGH**
   `paperLimitOrder()` calculated `budgetGate` but only enforced the native risk gate. Limit orders could therefore bypass regime-aware gross/net/strategy/cash budget enforcement.

2. **Opening-short strategy-cap bypass — HIGH**
   `checkRiskBudgetOrder()` enforced the per-strategy order cap only for buys. Opening short orders could exceed the configured strategy risk cap.

3. **Cross-symbol leverage exposure used stale average-entry prices — HIGH**
   Runtime leverage/exposure checks valued other symbols using `avgPrice`, not their latest known market marks. This could materially understate current exposure after favorable price movement.

4. **Daily PnL was cumulative, not daily — HIGH**
   Runtime assigned `dailyPnl = paper.realizedPnl` with no trading-day baseline/reset. The max-daily-loss gate could remain affected by prior-day realized PnL.

5. **Post-trade attribution on close/flip could use closing strategy identity — MEDIUM**
   Completed trade attribution used `fill.strategyId` for the closed leg rather than the opening lot's strategy identity. Close/flip paths now preserve the originating strategy for the realized trade and separately attribute the newly opened flipped lot.

6. **Release documentation drift**
   Canonical line-count handoff was stale; `package.json.bak` was removed. Master DOCX metadata was reconciled to v1.94 and rendered/visually checked. Root REPORT files now carry an explicit current-identity notice while preserving legacy text.

## Verification performed

- `release:integrity`: **PASS**
- `migration:integrity`: **PASS** — 56 numbered migrations hashed
- `test-coverage-integrity`: **PASS** — 137/137 TS test files reachable
- Focused risk/accounting regression suite: **29/29 PASS**
- Part 3 prior regression set remains available in the working baseline: **262/262 PASS**
- Broad source-test execution reached **172 passing tests before the audit-run timeout** with no `not ok` failures observed in the captured portion.
- Full `npm test` / typecheck / lint / build remain **environment-blocked** because the extracted workspace does not contain installed direct dependencies; `npm ci --offline` also could not complete because required tarballs were not cached.

## Remaining findings / non-blocking debt

- `package.json` name remains `helix-2.0`; this is an identity/packaging naming mismatch, not a runtime safety defect.
- Historical reports and some root documentation still contain legacy “Helix 2.0 — AI Organization OS” terminology, now explicitly labeled as legacy where appropriate.
- Full dependency-backed typecheck/lint/build and real PostgreSQL/external certification still require an environment with dependencies and external infrastructure.

## Safety boundary

Live execution remains disabled. No audit change enables live execution. RL remains research/paper-only.

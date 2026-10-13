import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRiskBudget, checkRiskBudgetOrder } from './risk-budget.ts';

test('risk budget reduces capital in high-volatility regime', () => {
  const normal = buildRiskBudget({ equity: 100000, maxGrossExposurePct: 0.8, maxNetExposurePct: 0.5, maxStrategyRiskPct: 0.2, regimeMultipliers: { normal: 1, 'high-vol': 0.5 }, minimumCashPct: 0.1 }, 'normal', ['s1']);
  const stressed = buildRiskBudget({ equity: 100000, maxGrossExposurePct: 0.8, maxNetExposurePct: 0.5, maxStrategyRiskPct: 0.2, regimeMultipliers: { normal: 1, 'high-vol': 0.5 }, minimumCashPct: 0.1 }, 'high-vol', ['s1']);
  assert.equal(normal.availableGrossRiskCapital, 72000);
  assert.equal(stressed.availableGrossRiskCapital, 36000);
  assert.equal(stressed.strategyRiskCapitals.s1, 9000);
});

test('risk budget is deterministic and de-duplicates strategy IDs', () => {
  const result = buildRiskBudget({ equity: 50000, maxGrossExposurePct: 0.6, maxNetExposurePct: 0.4, maxStrategyRiskPct: 0.1, regimeMultipliers: { normal: 0.75 }, minimumCashPct: 0.2 }, 'normal', ['b', 'a', 'b']);
  assert.deepEqual(Object.keys(result.strategyRiskCapitals), ['a', 'b']);
  assert.equal(result.regimeMultiplier, 0.75);
});


test("risk budget rejects orders that exceed gross/net regime-adjusted capital", () => {
  const allocation = buildRiskBudget({ equity: 10000, maxGrossExposurePct: 0.2, maxNetExposurePct: 0.1, maxStrategyRiskPct: 0.2, regimeMultipliers: { 'high-vol': 0.5 }, minimumCashPct: 0 }, 'high-vol', ['s1']);
  const result = checkRiskBudgetOrder({ allocation, side: 'buy', qty: 30, price: 100, positions: {}, symbol: 'BTCUSDT', strategyId: 's1' });
  assert.equal(result.ok, false);
  assert.ok(result.reasons.includes('risk_budget_gross_exposure_exceeded'));
  assert.ok(result.reasons.includes('risk_budget_net_exposure_exceeded'));
});


test('risk budget strategy cap applies to opening short orders too', () => {
  const allocation = buildRiskBudget({ equity: 10000, maxGrossExposurePct: 1, maxNetExposurePct: 1, maxStrategyRiskPct: 0.1, regimeMultipliers: { normal: 1 }, minimumCashPct: 0 }, 'normal', ['short']);
  const result = checkRiskBudgetOrder({ allocation, side: 'sell', qty: 101, price: 10, positions: {}, symbol: 'BTC', strategyId: 'short', currentCash: 10000 });
  assert.equal(result.ok, false);
  assert.ok(result.reasons.includes('risk_budget_strategy_cap_exceeded'));
});

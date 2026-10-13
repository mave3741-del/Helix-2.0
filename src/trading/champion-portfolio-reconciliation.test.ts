import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcileChampionPortfolio } from './champion-portfolio-reconciliation.ts';
import type { ClosedLoopCycleResult } from './learning/closed-loop.ts';

const cycle = (overrides: Partial<ClosedLoopCycleResult> = {}): ClosedLoopCycleResult => ({
  cycleId: 'c1', asOfTs: 1, snapshots: [], allocations: [{ strategyId: 'champ', weight: 1, score: 2 }], attribution: [], championId: 'champ', challengerIds: ['ch2'], decisions: [], failClosed: false, reasons: [], ...overrides,
});

test('champion portfolio reconciliation passes on aligned decision', () => {
  const r = reconcileChampionPortfolio({ reconciliationId:'r1', cycle:cycle(), championDecision:{ promote:true, retireChampion:true, reasons:[], scoreDelta:.2, pnlDelta:2 }, governanceRunId:'g1', portfolioAllocations:[{ strategyId:'champ', weight:1, score:2 }] });
  assert.equal(r.status,'reconciled');
  assert.equal(r.reasons.length,0);
  assert.equal(r.decisionHash.length,64);
});

test('reconciliation fail-closes when promoted champion is missing from portfolio', () => {
  const r = reconcileChampionPortfolio({ reconciliationId:'r2', cycle:cycle(), championDecision:{ promote:true, retireChampion:true, reasons:[], scoreDelta:.2, pnlDelta:2 }, governanceRunId:'g1', portfolioAllocations:[{ strategyId:'other', weight:1, score:2 }] });
  assert.equal(r.status,'fail_closed');
  assert.ok(r.reasons.includes('promoted_champion_missing_from_portfolio'));
});

test('reconciliation fail-closes when closed loop already failed closed', () => {
  const r = reconcileChampionPortfolio({ reconciliationId:'r3', cycle:cycle({ failClosed:true, reasons:['allocation_zero'] }), championDecision:null, governanceRunId:'g1', portfolioAllocations:[] });
  assert.equal(r.status,'fail_closed');
  assert.ok(r.reasons.includes('closed_loop_fail_closed'));
  assert.ok(r.reasons.includes('champion_decision_missing'));
});


test('reconciliation rejects non-normalized or invalid allocations', () => {
  const invalid = reconcileChampionPortfolio({ reconciliationId:'r4', cycle:cycle(), championDecision:{ promote:true, retireChampion:true, reasons:[], scoreDelta:.2, pnlDelta:2 }, governanceRunId:'g1', portfolioAllocations:[{ strategyId:'champ', weight:0.7, score:2 }] });
  assert.equal(invalid.status,'fail_closed');
  assert.ok(invalid.reasons.includes('portfolio_allocation_not_normalized'));

  const nonFinite = reconcileChampionPortfolio({ reconciliationId:'r5', cycle:cycle(), championDecision:{ promote:true, retireChampion:true, reasons:[], scoreDelta:.2, pnlDelta:2 }, governanceRunId:'g1', portfolioAllocations:[{ strategyId:'champ', weight:Number.NaN, score:2 }] });
  assert.equal(nonFinite.status,'fail_closed');
  assert.ok(nonFinite.reasons.includes('portfolio_allocation_invalid'));
});

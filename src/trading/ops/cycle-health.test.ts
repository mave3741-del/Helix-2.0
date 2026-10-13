import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateCycleHealth } from './cycle-health.ts';

test('healthy cycle passes all operational gates', () => {
  const result = evaluateCycleHealth({
    cycleId:'cycle-1', marketCount:1000, freshQuoteRatio:0.995, quorumAgreementRatio:0.97,
    governanceStatus:'reconciled', closedLoopFailClosed:false, paperFillCount:20, paperNetPnl:12,
    watchdogStatus:'normal', reconciliationHash:'abc',
  });
  assert.equal(result.status, 'healthy');
  assert.equal(result.reasons.length, 0);
  assert.equal(result.decisionHash.length, 64);
});

test('missing reconciliation fails closed', () => {
  const result = evaluateCycleHealth({
    cycleId:'cycle-2', marketCount:1000, freshQuoteRatio:0.99, quorumAgreementRatio:0.95,
    governanceStatus:'reconciled', closedLoopFailClosed:false, paperFillCount:10, paperNetPnl:1,
    watchdogStatus:'normal', reconciliationHash:null,
  });
  assert.equal(result.status, 'halted');
  assert.ok(result.reasons.includes('reconciliation_hash_missing'));
});

test('partial data becomes degraded, not healthy', () => {
  const result = evaluateCycleHealth({
    cycleId:'cycle-3', marketCount:930, freshQuoteRatio:0.96, quorumAgreementRatio:0.84,
    governanceStatus:'reconciled', closedLoopFailClosed:false, paperFillCount:8, paperNetPnl:-2,
    watchdogStatus:'degraded', reconciliationHash:'abc',
  });
  assert.equal(result.status, 'degraded');
  assert.ok(result.reasons.length >= 3);
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { evaluatePaperObservation } from './paper-observation.ts';

const policy = { minCycles:4, minTrades:40, minNetPnl:1, requiredRegimes:['trend','range','high-vol','liquidity-stress'], maxDrawdown:100, maxSlippageBps:20, allowDegradedCycles:true };

test('paper observation qualifies across all required regimes', () => {
  const result = evaluatePaperObservation([
    {cycleId:'1',regime:'trend',tradeCount:10,netPnl:5,maxDrawdown:10,slippageBps:4,healthStatus:'healthy',reconciliationHash:'a'},
    {cycleId:'2',regime:'range',tradeCount:10,netPnl:-1,maxDrawdown:20,slippageBps:5,healthStatus:'healthy',reconciliationHash:'b'},
    {cycleId:'3',regime:'high-vol',tradeCount:10,netPnl:3,maxDrawdown:30,slippageBps:6,healthStatus:'degraded',reconciliationHash:'c'},
    {cycleId:'4',regime:'liquidity-stress',tradeCount:10,netPnl:2,maxDrawdown:40,slippageBps:7,healthStatus:'healthy',reconciliationHash:'d'},
  ], policy);
  assert.equal(result.status,'qualified');
  assert.equal(result.totalTrades,40);
  assert.equal(result.netPnl,9);
});

test('paper observation blocks missing lineage or excessive risk', () => {
  const result = evaluatePaperObservation([{cycleId:'1',regime:'trend',tradeCount:1,netPnl:0,maxDrawdown:101,slippageBps:25,healthStatus:'healthy',reconciliationHash:null}], policy);
  assert.equal(result.status,'blocked');
  assert.ok(result.reasons.includes('paper_observation_drawdown_exceeded'));
  assert.ok(result.reasons.includes('paper_observation_reconciliation_missing'));
  assert.ok(result.reasons.includes('paper_observation_trade_count_below_minimum'));
  assert.ok(result.reasons.includes('paper_observation_net_pnl_below_minimum'));
});

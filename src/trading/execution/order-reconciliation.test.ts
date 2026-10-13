import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcileBrokerState, failClosedOnReconciliation } from './order-reconciliation.ts';

test('order reconciliation detects unexpected live-open order and position drift', () => {
  const result = reconcileBrokerState({
    desiredOrders: [{ clientOrderId:'c1', symbol:'BTC/USD', side:'buy', qty:1, status:'open' }],
    observedOrders: [{ id:'o2', clientOrderId:'c2', symbol:'BTC/USD', side:'buy', type:'market', qty:1, filledQty:0, status:'new' }],
    observedPositions: [{ symbol:'BTC/USD', qty:2, avgEntryPrice:100 }],
    expectedPositions: [{ symbol:'BTC/USD', qty:1 }],
  });
  assert.equal(result.status, 'drift');
  assert.ok(result.diff.missingOrders.includes('c1'));
  assert.ok(result.diff.unexpectedOrders.includes('c2'));
  assert.equal(failClosedOnReconciliation(result), false);
});

test('aligned broker state reconciles deterministically', () => {
  const result = reconcileBrokerState({
    desiredOrders: [{ clientOrderId:'c1', symbol:'AAPL', side:'buy', qty:2, status:'open' }],
    observedOrders: [{ id:'o1', clientOrderId:'c1', symbol:'AAPL', side:'buy', type:'market', qty:2, filledQty:0, status:'new' }],
    observedPositions: [{ symbol:'AAPL', qty:2, avgEntryPrice:100 }],
    expectedPositions: [{ symbol:'AAPL', qty:2 }],
  });
  assert.equal(result.status, 'reconciled');
  assert.equal(result.reasons.length, 0);
});

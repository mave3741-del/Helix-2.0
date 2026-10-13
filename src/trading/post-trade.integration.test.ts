import test from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryStrategyPerformanceStore, PaperPostTradeTracker, buildPerformanceSnapshot } from './post-trade.ts';

test('post-trade tracker closes paper positions and persists attribution inputs', async () => {
  const tracker = new PaperPostTradeTracker();
  tracker.recordFill({ clientOrderId:'o1', symbol:'BTC', side:'buy', qty:2, price:100.02, benchmarkPrice:100, fee:1, slippageBps:2, ts:1000, strategyId:'s1', regime:'trend', evidenceIds:['e1'] });
  const closed = tracker.recordFill({ clientOrderId:'o2', symbol:'BTC', side:'sell', qty:1, price:109.99, benchmarkPrice:110, fee:1, slippageBps:1, ts:2000, strategyId:'s1', regime:'trend', evidenceIds:['e2'] });
  assert.equal(closed.length, 1);
  assert.equal(closed[0].qty, 1);
  assert.ok(Math.abs(closed[0].netPnl - 8.47) < 1e-6);
  const state = tracker.exportState();
  const restored = new PaperPostTradeTracker();
  restored.restoreState(state);
  assert.equal(restored.openLots().length, 1);
  assert.equal(restored.trades('s1').length, 1);
  assert.equal((await buildPerformanceSnapshot('s1', restored.trades('s1'), 3000)).tradeCount, 1);
});


test('performance snapshots have a durable-store contract', async () => {
  const store = new InMemoryStrategyPerformanceStore();
  const snapshot = await buildPerformanceSnapshot('s1', [], 4000);
  await store.save(snapshot);
  const latest = await store.latest('s1');
  assert.equal(latest?.snapshotId, snapshot.snapshotId);
  assert.equal(latest?.netPnl, 0);
});


test('partial closes allocate entry fees proportionally across the remaining lot', () => {
  const tracker = new PaperPostTradeTracker();
  tracker.recordFill({ clientOrderId:'open', symbol:'BTC', side:'buy', qty:2, price:100, benchmarkPrice:100, fee:2, slippageBps:0, ts:1000, strategyId:'s1' });
  const first = tracker.recordFill({ clientOrderId:'close-1', symbol:'BTC', side:'sell', qty:1, price:110, benchmarkPrice:110, fee:1, slippageBps:0, ts:2000, strategyId:'s1' });
  const second = tracker.recordFill({ clientOrderId:'close-2', symbol:'BTC', side:'sell', qty:1, price:120, benchmarkPrice:120, fee:1, slippageBps:0, ts:3000, strategyId:'s1' });
  assert.equal(first.length, 1);
  assert.equal(second.length, 1);
  assert.equal(first[0].fees, 2);
  assert.equal(second[0].fees, 2);
  assert.equal(tracker.openLots().length, 0);
});


test('flip fills split exit and opening fees without double counting', () => {
  const tracker = new PaperPostTradeTracker();
  tracker.recordFill({ clientOrderId:'long', symbol:'BTC', side:'buy', qty:1, price:100, benchmarkPrice:100, fee:2, slippageBps:0, ts:1000, strategyId:'s1' });
  const closed = tracker.recordFill({ clientOrderId:'flip', symbol:'BTC', side:'sell', qty:2, price:110, benchmarkPrice:110, fee:3, slippageBps:0, ts:2000, strategyId:'s1' });
  assert.equal(closed.length, 1);
  assert.equal(closed[0].fees, 3.5);
  const open = tracker.openLots()[0]!;
  assert.equal(open.side, 'sell');
  assert.equal(open.qty, 1);
  assert.equal(open.entryFee, 1.5);
});

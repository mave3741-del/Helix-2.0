import assert from 'node:assert/strict';
import test from 'node:test';
import { ClosedLoopScheduler, InMemoryCycleHealthStore, type ClosedLoopCycleProvider } from './closed-loop-scheduler.ts';
import { InMemoryClosedLoopStore } from './closed-loop.ts';

const provider: ClosedLoopCycleProvider = {
  collectTrades: () => [],
  collectProfiles: () => [],
  collectCycleHealth: () => ({ marketCount: 900, freshQuoteRatio: 0.95, quorumAgreementRatio: 0.8, governanceStatus: 'reconciled', closedLoopFailClosed: false, paperFillCount: 0, paperNetPnl: 0, watchdogStatus: 'normal', reconciliationHash: 'abc' }),
};

test('scheduler persists health and halts on fail-closed cycle', async () => {
  const healthStore = new InMemoryCycleHealthStore();
  const scheduler = new ClosedLoopScheduler(provider, new InMemoryClosedLoopStore(), {
    minTrades: 1, maxDrawdown: 1, minRobustness: 0, maxStrategies: 2, maxWeight: 1, minWeight: 0, retireAfterNegativeCycles: 2,
  }, { intervalMs: 5000, persistEveryCycle: true, healthStore });
  scheduler.start();
  await scheduler.runOnce(1700000000000);
  const health = await healthStore.latest();
  assert.equal(health?.status, 'degraded');
  assert.equal(scheduler.isRunning(), true);
  scheduler.stop();
});

test('closed-loop failure halts scheduling', async () => {
  const healthStore = new InMemoryCycleHealthStore();
  const failProvider: ClosedLoopCycleProvider = { ...provider, collectCycleHealth: () => ({ marketCount:1000, freshQuoteRatio:1, quorumAgreementRatio:1, governanceStatus:'reconciled', closedLoopFailClosed:true, paperFillCount:0, paperNetPnl:0, watchdogStatus:'normal', reconciliationHash:'abc' }) };
  const scheduler = new ClosedLoopScheduler(failProvider, new InMemoryClosedLoopStore(), { minTrades:1,maxDrawdown:1,minRobustness:0,maxStrategies:1,maxWeight:1,minWeight:0,retireAfterNegativeCycles:1 }, { intervalMs:5000, healthStore });
  scheduler.start();
  await scheduler.runOnce(1700000001000);
  assert.equal((await healthStore.latest())?.status, 'halted');
  assert.equal(scheduler.isRunning(), false);
});


test('scheduler fails closed when authoritative health context is missing', async () => {
  const missingContextProvider: ClosedLoopCycleProvider = { collectTrades: () => [], collectProfiles: () => [] };
  const healthStore = new InMemoryCycleHealthStore();
  const scheduler = new ClosedLoopScheduler(missingContextProvider, new InMemoryClosedLoopStore(), { minTrades:1,maxDrawdown:1,minRobustness:0,maxStrategies:1,maxWeight:1,minWeight:0,retireAfterNegativeCycles:1 }, { intervalMs: 1000, healthStore });
  const result = await scheduler.runOnce(1234567894);
  const health = await healthStore.latest();
  assert.equal(result.cycleId.startsWith('closed-loop:'), true);
  assert.equal(health?.status, 'halted');
  assert.ok(health?.reasons.includes('missing_authoritative_health_context'));
});

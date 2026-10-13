import assert from 'node:assert/strict';
import test from 'node:test';
import { attributePaperTrade } from '../post-trade.ts';
import { InMemoryClosedLoopStore } from './closed-loop.ts';
import { ClosedLoopScheduler, type ClosedLoopCycleProvider } from './closed-loop-scheduler.ts';

const trade = (strategyId: string, pnl: number, ts: number, regime: string) => attributePaperTrade({
  tradeId:`scheduler:${strategyId}:${ts}`, strategyId, symbol:'BTC/USDT', side:'buy', qty:1,
  entryPrice:100, entryBenchmarkPrice:100, exitPrice:100 + pnl, exitBenchmarkPrice:100 + pnl,
  grossPnl:pnl, fees:0, slippageCost:0, holdingMs:1000, regime, evidenceIds:['e'], createdAt:ts,
});

const policy = { minTrades:2, maxDrawdown:0.5, minRobustness:0.7, maxStrategies:3, maxWeight:0.8, minWeight:0.05, retireAfterNegativeCycles:3 };

function provider(): ClosedLoopCycleProvider {
  return {
    collectTrades: () => [trade('a', 2, 100, 'trend'), trade('a', 1, 200, 'range')],
    collectProfiles: () => [{ strategyId:'a', experimentId:'exp-a', expectedReturn:.2, volatility:.1, sharpe:2, robustness:.9, turnover:.1, correlationToPortfolio:.1, status:'champion' }],
    collectRealizedReturns: () => ({ a: 3 }),
    collectRealizedRisk: () => ({ a: .1 }),
  };
}

test('scheduler persists a completed cycle and exposes latest result', async () => {
  const store = new InMemoryClosedLoopStore();
  const scheduler = new ClosedLoopScheduler(provider(), store, policy, { intervalMs: 1000, startImmediately:false });
  const result = await scheduler.runOnce(1000);
  assert.equal(result.failClosed, false);
  assert.equal((await store.latest())?.cycleId, result.cycleId);
});

test('scheduler rejects overlapping cycles and remains reusable', async () => {
  const slowProvider: ClosedLoopCycleProvider = {
    ...provider(),
    collectProfiles: () => provider().collectProfiles(),
  };
  const scheduler = new ClosedLoopScheduler(slowProvider, new InMemoryClosedLoopStore(), policy, { intervalMs:1000 });
  const first = scheduler.runOnce(2000);
  await assert.rejects(() => scheduler.runOnce(2000), /closed_loop_cycle_already_running/);
  await first;
  const second = await scheduler.runOnce(3000);
  assert.equal(second.cycleId.endsWith(':2'), true);
});

test('scheduler start and stop are idempotent', async () => {
  const scheduler = new ClosedLoopScheduler(provider(), new InMemoryClosedLoopStore(), policy, { intervalMs:1000 });
  scheduler.start();
  scheduler.start();
  assert.equal(scheduler.isRunning(), true);
  scheduler.stop();
  scheduler.stop();
  assert.equal(scheduler.isRunning(), false);
});

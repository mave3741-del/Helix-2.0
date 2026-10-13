import assert from 'node:assert/strict';
import test from 'node:test';
import { attributePaperTrade } from '../post-trade.ts';
import { InMemoryClosedLoopStore, runClosedLoopCycle } from './closed-loop.ts';

const baseTrade = (strategyId: string, pnl: number, createdAt: number) => attributePaperTrade({
  tradeId:`t:${strategyId}:${createdAt}`, strategyId, symbol:'BTC/USDT', side:'buy', qty:1,
  entryPrice:100, entryBenchmarkPrice:100, exitPrice:100+pnl, exitBenchmarkPrice:100+pnl,
  grossPnl:pnl, fees:0, slippageCost:0, holdingMs:1000, regime:'trend', evidenceIds:['e1'], createdAt,
});

test('closed loop excludes strategies below trade/robustness gates', async () => {
  const result = await runClosedLoopCycle({
    cycleId:'cycle-1', asOfTs:1000,
    trades:[baseTrade('a', 2, 100), baseTrade('a', 1, 200)],
    profiles:[
      { strategyId:'a', experimentId:'e-a', expectedReturn:.1, volatility:.1, sharpe:1, robustness:.8, turnover:.1, correlationToPortfolio:.1, status:'challenger' },
      { strategyId:'b', experimentId:'e-b', expectedReturn:.1, volatility:.1, sharpe:1, robustness:.5, turnover:.1, correlationToPortfolio:.1, status:'challenger' },
    ],
  }, { minTrades:2, maxDrawdown:.4, minRobustness:.7, maxStrategies:3, maxWeight:.8, minWeight:.05, retireAfterNegativeCycles:3 });
  assert.deepEqual(result.allocations.map((x)=>x.strategyId), ['a']);
  assert.equal(result.failClosed, false);
});

test('repeated negative cycles produce retirement recommendation', async () => {
  const result = await runClosedLoopCycle({
    cycleId:'cycle-2', asOfTs:2000,
    trades:[baseTrade('a', -1, 100), baseTrade('a', -2, 200)],
    profiles:[{ strategyId:'a', experimentId:'e-a', expectedReturn:.1, volatility:.1, sharpe:.2, robustness:.8, turnover:.1, correlationToPortfolio:.1, status:'champion' }],
    priorState:[{ strategyId:'a', negativeCycles:2 }],
  }, { minTrades:2, maxDrawdown:.4, minRobustness:.7, maxStrategies:3, maxWeight:.8, minWeight:.05, retireAfterNegativeCycles:3 });
  assert.equal(result.decisions[0]?.action, 'retire');
  assert.equal(result.failClosed, true);
});

test('in-memory closed-loop store preserves a defensive copy', async () => {
  const store = new InMemoryClosedLoopStore();
  const result = await runClosedLoopCycle({
    cycleId:'cycle-3', asOfTs:3000,
    trades:[baseTrade('a', 3, 100), baseTrade('a', 4, 200)],
    profiles:[{ strategyId:'a', experimentId:'e-a', expectedReturn:.2, volatility:.1, sharpe:2, robustness:.9, turnover:.1, correlationToPortfolio:.1, status:'champion' }],
  }, { minTrades:2, maxDrawdown:.4, minRobustness:.7, maxStrategies:3, maxWeight:.8, minWeight:.05, retireAfterNegativeCycles:3 });
  await store.save(result);
  result.decisions[0]!.weight = 0;
  const stored = await store.latest();
  assert.notEqual(stored?.decisions[0]?.weight, 0);
});

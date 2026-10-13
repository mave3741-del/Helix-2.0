import assert from 'node:assert/strict';
import test from 'node:test';
import { runDeterministicMultiCycleSimulation } from './multi-cycle-simulation.ts';

test('four-regime multi-cycle simulation converges without runaway turnover', async () => {
  const result = await runDeterministicMultiCycleSimulation({ minTrades:4, maxDrawdown:10, minRobustness:.7, maxStrategies:3, maxWeight:.8, minWeight:.05, retireAfterNegativeCycles:3 });
  assert.equal(result.cycles.length, 4);
  assert.deepEqual(result.regimeCoverage, ['trend','range','high-volatility','liquidity-stress']);
  assert.ok(result.maxTurnoverDelta <= 1);
  assert.equal(result.failClosedCycles, 0);
});

test('multi-cycle simulation detects weak strategy retirement behavior', async () => {
  const result = await runDeterministicMultiCycleSimulation({ minTrades:4, maxDrawdown:10, minRobustness:.7, maxStrategies:3, maxWeight:.8, minWeight:.05, retireAfterNegativeCycles:2 });
  assert.ok(result.retirements.includes('c'));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { scoreStrategies, chooseChampionChallenger, allocateEnsemble, attributeEnsemblePerformance, type StrategyExperimentSnapshot } from './portfolio-ensemble.ts';

const rows: StrategyExperimentSnapshot[] = [
  { strategyId:'s1', experimentId:'e1', expectedReturn:.2, volatility:.1, maxDrawdown:.1, sharpe:1.8, robustness:.9, paperReturn:.15, turnover:.1, correlationToPortfolio:.1, status:'champion' },
  { strategyId:'s2', experimentId:'e2', expectedReturn:.18, volatility:.12, maxDrawdown:.12, sharpe:1.6, robustness:.85, paperReturn:.14, turnover:.2, correlationToPortfolio:-.2, status:'challenger' },
  { strategyId:'s3', experimentId:'e3', expectedReturn:.3, volatility:.2, maxDrawdown:.5, sharpe:2.4, robustness:.95, paperReturn:.2, turnover:.4, correlationToPortfolio:.9, status:'candidate' },
];

test('ensemble scoring rewards robust diversified strategies', () => {
  const ranked = scoreStrategies(rows);
  assert.equal(ranked[0]!.strategyId,'s1');
  assert.equal(chooseChampionChallenger(rows).champion?.strategyId,'s1');
  const allocations = allocateEnsemble(rows,2);
  assert.equal(allocations.length,2);
  assert.ok(Math.abs(allocations.reduce((s,x)=>s+x.weight,0)-1) < 1e-9);
});

test('ensemble attribution is deterministic', () => {
  const allocations = [{strategyId:'s1',weight:.6,score:1},{strategyId:'s2',weight:.4,score:.8}];
  const attribution = attributeEnsemblePerformance({ snapshots:rows, realizedReturns:{s1:.1,s2:.05}, realizedRisk:{s1:.2,s2:.1}, allocations });
  assert.equal(attribution.length,2);
  assert.ok(attribution[0]!.contribution > attribution[1]!.contribution);
});

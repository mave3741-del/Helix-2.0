import test from 'node:test';
import assert from 'node:assert/strict';
import { runPhase5ControlPlane } from './phase5-control-plane.ts';
import type { StrategyPerformanceSnapshot as PaperPerformanceSnapshot } from './post-trade.ts';

const snapshot = { strategyId: 's1', experimentId: 'e1', expectedReturn: 0.1, volatility: 0.1, maxDrawdown: 0.05, sharpe: 1.2, robustness: 0.9, paperReturn: 0.1, turnover: 0.1, correlationToPortfolio: 0.1, status: 'champion' as const };
// `championRotation.championSnapshot` (below) is a *different* type from the
// research/adaptation `snapshot` above — champion-rotation.ts requires the
// live post-trade attribution shape (post-trade.ts's StrategyPerformanceSnapshot,
// with netPnl/byRegime) because it compares real paper-trading performance,
// not the lighter research-experiment snapshot used for weight adaptation.
// Both types happen to share the same name across modules; they are not
// interchangeable.
const championPerformanceSnapshot: PaperPerformanceSnapshot = {
  snapshotId: 'snap-champion', strategyId: 's1', asOfTs: Date.now(), tradeCount: 60, wins: 40, losses: 20,
  netPnl: 500, grossPnl: 520, fees: 15, slippageCost: 5, winRate: 40 / 60, avgTradePnl: 500 / 60,
  maxDrawdown: 0.05, profitFactor: 2, expectancy: 500 / 60,
  byRegime: { trend: { trades: 60, netPnl: 500, winRate: 40 / 60 } },
  attributionHash: 'a'.repeat(32),
};
const championMetrics = {
  strategyId: 's1', evaluationAt: Date.now(), maxAgeMs: 86_400_000,
  statistical: { tradeCount: 60, meanReturn: 0.01, volatility: 0.02, sharpe: 1.8, tStatistic: 2.2, significantAt95: true, maxDrawdown: 0.05, robustness: 0.9, multipleTestingPenalty: 0.9, adjustedScore: 0.85 },
  parameterSensitivityPassed: true, bootstrapPassed: true, oosPassed: true, walkForwardPassed: true, paperTradeCount: 60, currentDrawdown: 0.05,
};
const input = {
  learning: {
    cycleId: 'c1', snapshots: [snapshot], feedbackByStrategy: {}, currentWeights: { s1: 0.5 },
    adaptationPolicy: { maxIncreasePct: 0.1, maxDecreasePct: 0.1, minWeight: 0.05, maxWeight: 0.8, reliabilityFloor: 0.4, robustnessFloor: 0.7 },
    allocationPolicy: { capital: 10000, maxStrategies: 1, maxStrategyPct: 1, minStrategyPct: 1, correlationPenalty: 0.2, minRobustness: 0.7 },
    championRotation: { championMetrics, challengerMetrics: [], championSnapshot: championPerformanceSnapshot, challengerSnapshots: [] }, executionFeedback: [],
  },
  riskBudget: { equity: 10000, maxGrossExposurePct: 0.8, maxNetExposurePct: 0.5, maxStrategyRiskPct: 0.5, regimeMultipliers: { normal: 1 }, minimumCashPct: 0.1 },
  regime: 'normal',
  observationCycles: [{ cycleId: 'o1', regime: 'trend', tradeCount: 5, netPnl: 100, maxDrawdown: 0.05, slippageBps: 2, healthStatus: 'healthy' as const, reconciliationHash: 'r1' }],
  observationPolicy: { minCycles: 1, minTrades: 1, minNetPnl: 0, requiredRegimes: ['trend'], maxDrawdown: 0.2, maxSlippageBps: 10, allowDegradedCycles: false }, learningHealth: true,
  liquidity: { desiredQty: 10, side: 'buy' as const, maxParticipationPct: 0.5, riskCapital: 2000, referencePrice: 100, quote: { venue: 'paper', bid: 99, ask: 101, bidSize: 50, askSize: 50, feeBps: 2, healthy: true } },
};

test('phase5 control plane admits a healthy integrated learning cycle', () => {
  const result = runPhase5ControlPlane(input);
  assert.equal(result.admitted, true);
  assert.ok(result.learning);
  assert.ok(result.audit);
  assert.ok(result.riskBudget.availableGrossRiskCapital > 0);
  assert.ok(result.liquiditySizing.approvedQty > 0);
});

test('phase5 control plane fails closed on missing learning observation', () => {
  const result = runPhase5ControlPlane({ ...input, observationCycles: [] });
  assert.equal(result.admitted, false);
  assert.ok(result.reasons.includes('paper_observation_cycle_count_below_minimum'));
});

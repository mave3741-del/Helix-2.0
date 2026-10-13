import assert from 'node:assert/strict';
import test from 'node:test';
import { adaptStrategyWeight } from './strategy-adaptation.ts';
import { evaluateChampionRotation } from './champion-rotation.ts';
import { runPhase5LearningCycle } from './phase5-learning-orchestrator.ts';
import { buildAdaptiveAllocations } from '../portfolio/adaptive-allocation.ts';
import { buildExecutionQualityFeedback } from '../execution/execution-quality-feedback.ts';

const snapshot = (strategyId: string, overrides: Record<string, number> = {}) => ({ strategyId, experimentId: `exp:${strategyId}`, expectedReturn: 0.1, volatility: 0.1, maxDrawdown: 0.08, sharpe: 1.5, robustness: 0.9, paperReturn: 0.12, turnover: 0.2, correlationToPortfolio: 0.1, status: 'challenger' as const, tradeCount: 10, wins: 7, losses: 3, netPnl: 100, grossPnl: 120, fees: 5, slippageCost: 15, winRate: 0.7, avgTradePnl: 10, profitFactor: 2, expectancy: 10, byRegime: { trend: { trades: 10, netPnl: 100, winRate: 0.7 } }, snapshotId: `snapshot:${strategyId}`, attributionHash: `hash:${strategyId}`, asOfTs: Date.now(), ...overrides });
const championMetrics = (strategyId: string, adjustedScore = 1) => ({ strategyId, evaluationAt: Date.now(), maxAgeMs: 86_400_000, statistical: { tradeCount: 100, meanReturn: 0.02, volatility: 0.04, sharpe: 2.2, tStatistic: 2.5, significantAt95: true, maxDrawdown: 0.05, robustness: 0.9, multipleTestingPenalty: 0.9, adjustedScore }, parameterSensitivityPassed: true, bootstrapPassed: true, oosPassed: true, walkForwardPassed: true, paperTradeCount: 100, currentDrawdown: 0.05 });

test('strategy adaptation increases strong strategy weight', () => { const d = adaptStrategyWeight({ snapshot: snapshot('s1'), currentWeight: 0.2 }, { maxIncreasePct: 0.25, maxDecreasePct: 0.2, minWeight: 0, maxWeight: 0.5, reliabilityFloor: 0.35, robustnessFloor: 0.6 }); assert.equal(d.action, 'increase'); assert.ok(d.targetWeight > 0.2); });

test('strategy adaptation quarantines fragile strategy', () => { const d = adaptStrategyWeight({ snapshot: snapshot('s2', { robustness: 0.3 }), currentWeight: 0.2 }, { maxIncreasePct: 0.25, maxDecreasePct: 0.2, minWeight: 0, maxWeight: 0.5, reliabilityFloor: 0.35, robustnessFloor: 0.6 }); assert.equal(d.action, 'quarantine'); assert.equal(d.targetWeight, 0); });

test('adaptive allocation respects cap', () => { const out = buildAdaptiveAllocations([snapshot('s1', { sharpe: 2 }), snapshot('s2', { sharpe: 1 }), snapshot('s3', { sharpe: 0.5 })], { capital: 100000, maxStrategies: 3, maxStrategyPct: 0.6, minStrategyPct: 0.1, correlationPenalty: 0.5, minRobustness: 0.6 }); assert.ok(out.reduce((s, x) => s + x.weight, 0) <= 1.00001); assert.ok(out.every((x) => x.weight <= 0.6 + 1e-9)); });

test('execution quality throttles weak fills', () => { const fb = buildExecutionQualityFeedback({ strategyId:'s1', symbol:'BTC/USD', requestedQty:10, benchmarkPrice:100, fills:[{venue:'paper', qty:4, price:105, benchmarkPrice:100, fee:1, slippageBps:80}] }); assert.equal(fb.action, 'throttle'); assert.ok(fb.executionAdjustment < 0); });

test('champion rotation promotes qualified challenger', () => { const result = evaluateChampionRotation({ championMetrics: championMetrics('champ', 0.95), challengerMetrics:[championMetrics('challenger', 1.05)], championSnapshot:snapshot('champ', { sharpe:1 }), challengerSnapshots:[snapshot('challenger', { sharpe:2, paperReturn:0.3 })], minScoreAdvantage:-1, minPnlAdvantage:-1, regimeCoverageMin:0, }); assert.equal(result.promotedChampion, 'challenger'); });

test('phase 5 learning cycle creates deterministic hash', () => { const input = { cycleId:'phase5:test:1', snapshots:[snapshot('s1')], feedbackByStrategy:{s1:[]}, currentWeights:{s1:0.25}, adaptationPolicy:{maxIncreasePct:0.2,maxDecreasePct:0.2,minWeight:0,maxWeight:0.6,reliabilityFloor:0.3,robustnessFloor:0.6}, allocationPolicy:{capital:10000,maxStrategies:2,maxStrategyPct:0.8,minStrategyPct:0.1,correlationPenalty:0.5,minRobustness:0.6}, championRotation:{championMetrics:championMetrics('s1'),challengerMetrics:[],championSnapshot:snapshot('s1'),challengerSnapshots:[]}, executionFeedback:[] }; const a = runPhase5LearningCycle(input); const b = runPhase5LearningCycle(input); assert.equal(a.decisionHash, b.decisionHash); assert.equal(a.failClosed, false); });

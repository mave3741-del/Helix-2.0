import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateLearningAdmission } from './learning-admission.ts';

const cycle = { cycleId: 'c1', regime: 'trend', tradeCount: 4, netPnl: 10, maxDrawdown: 0.05, slippageBps: 2, healthStatus: 'healthy' as const, reconciliationHash: 'r1' };
const policy = { minCycles: 1, minTrades: 1, minNetPnl: 0, requiredRegimes: ['trend'], maxDrawdown: 0.2, maxSlippageBps: 10, allowDegradedCycles: false };

test('learning admission opens only when observation and upstream health pass', () => {
  assert.equal(evaluateLearningAdmission([cycle], policy, true).admitted, true);
  const blocked = evaluateLearningAdmission([cycle], policy, false);
  assert.equal(blocked.admitted, false);
  assert.ok(blocked.reasons.includes('upstream_learning_health_not_ready'));
});

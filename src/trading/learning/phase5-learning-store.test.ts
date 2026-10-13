import assert from 'node:assert/strict';
import test from 'node:test';
import { InMemoryPhase5LearningStore } from './phase5-learning-store.ts';
import type { Phase5LearningResult } from './phase5-learning-orchestrator.ts';

test('learning store keeps latest cycle and execution feedback', async () => {
  const store = new InMemoryPhase5LearningStore();
  const result: Phase5LearningResult = { cycleId: 'phase5:1', strategyAdaptation: [], allocations: [], championRotation: { currentChampion: 's1', promotedChampion: null, challengerRank: [], rationale: [] }, executionThrottle: {}, failClosed: false, reasons: [], decisionHash: 'abc' };
  await store.saveCycle(result);
  await store.saveExecutionFeedback([{ strategyId: 's1', symbol: 'BTC/USD', quality: { implementationShortfallBps: 1, feeBps: 1, slippageBps: 1, fillRate: 1, qualityScore: 95 }, executionAdjustment: 0.05, action: 'improve' }]);
  assert.equal((await store.latestCycle())?.decisionHash, 'abc');
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPostTradeFeedback, InMemoryPostTradeFeedbackStore, recordPostTradeFeedback } from './post-trade-feedback.ts';

test('post-trade feedback credits workers and councils with deterministic reliability signals', async () => {
  const store = new InMemoryPostTradeFeedbackStore();
  const decision = { decisionSubjectId: 'paper:BTCUSDT', action: 'buy' as const, confidence: 0.8, participantIds: ['W-2', 'W-1', 'W-1'], councilIds: ['crypto', 'risk'] };
  const records = await recordPostTradeFeedback(store, { tradeId: 't1', strategyId: 's1', symbol: 'BTCUSDT', netPnl: 100, createdAt: 1000, decision });
  assert.equal(records.length, 4);
  assert.equal(records[0].creditShare, 0.25);
  assert.ok(records.every((r) => r.outcome === 'win'));
  const worker = await store.summary('worker', 'W-1');
  const council = await store.summary('council', 'risk');
  assert.equal(worker?.tradeCount, 1);
  assert.equal(worker?.netPnl, 25);
  assert.equal(council?.reliability && council.reliability > 0.5, true);
});

test('losses reduce decision score and duplicate record ids are idempotent', async () => {
  const store = new InMemoryPostTradeFeedbackStore();
  const trade = { tradeId: 't2', strategyId: 's1', symbol: 'BTCUSDT', netPnl: -50, createdAt: 2000, decision: { decisionSubjectId: 'paper:BTCUSDT', action: 'buy' as const, confidence: 0.7, participantIds: ['W-1'], councilIds: ['crypto'] } };
  const first = buildPostTradeFeedback(trade);
  await store.saveMany(first);
  await store.saveMany(first);
  const summary = await store.summary('worker', 'W-1');
  assert.equal(first.length, 2);
  assert.equal(summary?.tradeCount, 1);
  assert.equal(summary?.wins, 0);
  assert.equal(summary?.losses, 1);
  assert.ok((summary?.avgDecisionScore ?? 0) < 0);
});

test('no decision context means no member feedback', () => {
  assert.deepEqual(buildPostTradeFeedback({ tradeId:'t3', strategyId:'s1', symbol:'ETH', netPnl:10, createdAt:3000 }), []);
});

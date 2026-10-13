import assert from 'node:assert/strict';
import test from 'node:test';
import { applyNewsImpactToScan } from './news-market-bridge.ts';

const scan = {
  scanId: 'scan-1', cadence: 'normal' as const, startedAt: 100, completedAt: 100,
  universeSize: 2, validMarkets: 2, rejectedMarkets: 0,
  candidates: [
    { symbol: 'BTCUSD', venue: 'paper', market: 'crypto' as const, score: 0.50, reasons: ['liquidity'], snapshotTs: 100 },
    { symbol: 'AAPL', venue: 'paper', market: 'equity' as const, score: 0.70, reasons: ['momentum'], snapshotTs: 100 },
  ], scoreVersion: 'v2', policyVersion: 'v2',
};

test('direct symbol news gets stronger boost than broad market news', () => {
  const result = applyNewsImpactToScan(scan, [
    { articleId: 'news:1', eventKind: 'crypto_event', severity: 'critical', urgency: 'immediate', direction: 'bearish', confidence: 0.9, affectedMarkets: ['crypto'], affectedSymbols: ['BTCUSD'], councilIds: ['crypto','risk'], rationale: [] },
  ], { candidateLimit: 10 });
  const btc = result.candidates.find((c) => c.symbol === 'BTCUSD');
  const aapl = result.candidates.find((c) => c.symbol === 'AAPL');
  assert.ok(btc);
  assert.ok(aapl);
  assert.ok(btc.newsBoost > aapl.newsBoost);
  assert.ok(btc.score > 0.5);
});

test('broad market event boosts matching candidates', () => {
  const result = applyNewsImpactToScan(scan, [
    { articleId: 'news:2', eventKind: 'macro_release', severity: 'high', urgency: 'fast', direction: 'mixed', confidence: 0.8, affectedMarkets: ['crypto'], affectedSymbols: [], councilIds: ['macro'], rationale: [] },
  ]);
  const btc = result.candidates.find((c) => c.symbol === 'BTCUSD');
  assert.ok(btc);
  assert.ok(btc.newsBoost > 0);
  assert.equal(result.unroutableNewsCount, 0);
});

test('unroutable news is reported and candidate ordering remains deterministic', () => {
  const result = applyNewsImpactToScan(scan, [
    { articleId: 'news:3', eventKind: 'market_news', severity: 'low', urgency: 'routine', direction: 'neutral', confidence: 0.5, affectedMarkets: [], affectedSymbols: [], councilIds: ['news'], rationale: [] },
  ]);
  assert.equal(result.unroutableNewsCount, 1);
  assert.deepEqual(result.candidates.map((c) => c.symbol), ['AAPL','BTCUSD']);
});

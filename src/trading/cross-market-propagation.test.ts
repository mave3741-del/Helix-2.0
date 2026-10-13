import assert from 'node:assert/strict';
import test from 'node:test';
import { propagateNewsAcrossMarkets } from './cross-market-propagation.ts';

const candidates = [
  { symbol: 'BTCUSD', venue: 'paper', market: 'crypto' as const, score: 0.50, reasons: [], snapshotTs: 100, newsBoost: 0, newsArticleIds: [], newsReasons: [], newsCouncilIds: [] },
  { symbol: 'QQQ', venue: 'paper', market: 'equity' as const, score: 0.50, reasons: [], snapshotTs: 100, newsBoost: 0, newsArticleIds: [], newsReasons: [], newsCouncilIds: [] },
  { symbol: 'TLT', venue: 'paper', market: 'rates' as const, score: 0.40, reasons: [], snapshotTs: 100, newsBoost: 0, newsArticleIds: [], newsReasons: [], newsCouncilIds: [] },
  { symbol: 'AAPL', venue: 'paper', market: 'equity' as const, score: 0.70, reasons: [], snapshotTs: 100, newsBoost: 0, newsArticleIds: [], newsReasons: [], newsCouncilIds: [] },
];

test('central bank event propagates to related cross-market proxies', () => {
  const result = propagateNewsAcrossMarkets(candidates, [{
    articleId: 'n1', eventKind: 'central_bank_policy', severity: 'high', urgency: 'fast', direction: 'mixed', confidence: 0.9,
    affectedMarkets: ['fx'], affectedSymbols: [], councilIds: ['macro'], rationale: [],
  }]);
  const qqq = result.candidates.find((c) => c.symbol === 'QQQ');
  const tlt = result.candidates.find((c) => c.symbol === 'TLT');
  assert.ok(qqq && qqq.propagationBoost > 0);
  assert.ok(tlt && tlt.propagationBoost > qqq.propagationBoost);
  assert.ok(result.propagatedTargets.length >= 4);
});

test('two-hop propagation decays and remains bounded', () => {
  const result = propagateNewsAcrossMarkets(candidates, [{
    articleId: 'n2', eventKind: 'central_bank_policy', severity: 'critical', urgency: 'immediate', direction: 'bearish', confidence: 1,
    affectedMarkets: ['rates'], affectedSymbols: [], councilIds: ['macro'], rationale: [],
  }], { maxPropagatedBoost: 0.10 });
  const btc = result.candidates.find((c) => c.symbol === 'BTCUSD');
  assert.ok(btc);
  assert.ok(btc.propagationBoost > 0);
  assert.ok(btc.propagationBoost <= 0.10);
});

test('direct news does not get double-counted as full propagation', () => {
  const result = propagateNewsAcrossMarkets(candidates, [{
    articleId: 'n3', eventKind: 'crypto_event', severity: 'high', urgency: 'fast', direction: 'bullish', confidence: 0.9,
    affectedMarkets: ['crypto'], affectedSymbols: ['BTCUSD'], councilIds: ['crypto'], rationale: [],
  }]);
  const btc = result.candidates.find((c) => c.symbol === 'BTCUSD');
  assert.ok(btc);
  assert.ok(btc.propagationBoost < 0.05);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateMarketDataHealth, assertMarketDataReady } from './data-health.ts';

test('market data health requires quorum and classifies stale source', () => {
  const result = evaluateMarketDataHealth([
    { sourceId:'a',healthy:true,observedAt:1000,latencyMs:30,quality:1,errorRate:0,markets:['BTC/USD'] },
    { sourceId:'b',healthy:true,observedAt:1000,latencyMs:40,quality:.9,errorRate:.01,markets:['BTC/USD'] },
    { sourceId:'c',healthy:true,observedAt:1,latencyMs:10,quality:1,errorRate:0,markets:['BTC/USD'] },
  ], 1000, { maxAgeMs:100,maxLatencyMs:100,minQuality:.8,maxErrorRate:.2,minHealthySources:2 });
  assert.equal(result.state, 'degraded');
  assert.deepEqual(result.quorumReadyMarkets, ['BTC/USD']);
  assert.ok(result.haltedSources.includes('c'));
  assert.doesNotThrow(() => assertMarketDataReady(result));
});

test('health gate fails closed when no quorum exists', () => {
  const result = evaluateMarketDataHealth([{ sourceId:'a',healthy:true,observedAt:0,latencyMs:10,quality:1,errorRate:0,markets:['ETH/USD'] }], 1000, { maxAgeMs:100,maxLatencyMs:100,minQuality:.8,maxErrorRate:.2,minHealthySources:2 });
  assert.equal(result.state, 'halted');
  assert.throws(() => assertMarketDataReady(result), /market_data_not_ready/);
});


test('explicitly unhealthy source cannot enter healthy quorum', () => {
  const result = evaluateMarketDataHealth([
    { sourceId:'a',healthy:false,observedAt:1000,latencyMs:10,quality:1,errorRate:0,markets:['BTC/USD'] },
    { sourceId:'b',healthy:true,observedAt:1000,latencyMs:10,quality:1,errorRate:0,markets:['BTC/USD'] },
  ], 1000, { maxAgeMs:100,maxLatencyMs:100,minQuality:.8,maxErrorRate:.2,minHealthySources:2 });
  assert.equal(result.state, 'degraded');
  assert.deepEqual(result.healthySources, ['b']);
  assert.ok(result.haltedSources.includes('a'));
  assert.equal(result.quorumReadyMarkets.length, 0);
});

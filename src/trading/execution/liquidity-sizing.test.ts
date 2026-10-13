import test from 'node:test';
import assert from 'node:assert/strict';
import { sizeForLiquidity } from './liquidity-sizing.ts';

const quote = { venue: 'paper', bid: 99, ask: 101, bidSize: 100, askSize: 80, feeBps: 2, healthy: true };

test('liquidity sizing caps participation on the chosen side', () => {
  const result = sizeForLiquidity({ desiredQty: 100, side: 'buy', maxParticipationPct: 0.25, quote, referencePrice: 101 });
  assert.equal(result.approvedQty, 20);
  assert.equal(result.participationPct, 0.25);
  assert.ok(result.depthLimited);
});

test('liquidity sizing combines risk cap and execution throttle', () => {
  const result = sizeForLiquidity({ desiredQty: 50, side: 'sell', maxParticipationPct: 0.5, throttleMultiplier: 0.5, riskCapital: 1000, referencePrice: 100, quote });
  assert.equal(result.approvedQty, 5);
  assert.equal(result.throttled, true);
});

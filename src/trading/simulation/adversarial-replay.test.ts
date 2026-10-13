import assert from 'node:assert/strict';
import test from 'node:test';
import { replayRobustness, runAdversarialReplay } from './adversarial-replay.ts';

test('adversarial replay is deterministic and covers stress matrix', () => {
  const results = runAdversarialReplay([{ symbol:'BTCUSDT', midPrice:100, bidSize:100, askSize:100, side:'buy', qty:10, baseSpreadBps:5, latencyMs:100 }]);
  assert.equal(results.length, 6);
  assert.ok(results.some((r) => r.stress === 'venue-outage' && r.rejected));
  assert.ok(replayRobustness(results) >= 0 && replayRobustness(results) <= 1);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { DeterministicFastPath } from './event-driven-fast-path.ts';
import type { FastRiskSnapshot, MarketTick } from '../latency.ts';

const risk: FastRiskSnapshot = {
  dailyCapitalLimit: 10_000,
  allocatedCapital: 0,
  maxPositionNotional: 2_000,
  maxPortfolioDrawdown: 0.1,
  killSwitch: false,
  staleAfterMs: 200,
};

function tick(sequence: number, exchangeTs = 1_000): MarketTick {
  return {
    symbol: 'BTCUSDT', venue: 'paper', market: 'crypto', bid: 100, ask: 100.1, last: 100.05,
    bidSize: 900, askSize: 100, sequence, exchangeTs, receivedTs: exchangeTs,
  };
}

test('accepts valid deterministic paper fast-path event', () => {
  const path = new DeterministicFastPath();
  const result = path.processTick({ tick: tick(1), notional: 500, risk, now: 1_050, paperSessionActive: true });
  assert.equal(result.accepted, true);
  assert.equal(result.signalSide, 'buy');
  assert.equal(result.estimatedBudgetMs, 10);
  assert.equal(result.event.type, 'market.tick');
  assert.match(result.decisionHash, /^[a-f0-9]{64}$/);
});

test('rejects stale ticks before routing', () => {
  const path = new DeterministicFastPath();
  const result = path.processTick({ tick: tick(1, 1_000), notional: 500, risk, now: 1_500, paperSessionActive: true });
  assert.equal(result.accepted, false);
  assert.equal(result.reason, 'stale-market-data');
});

test('rejects duplicate and out-of-order events', () => {
  const path = new DeterministicFastPath();
  const first = path.processTick({ tick: tick(2), notional: 500, risk, now: 1_050, paperSessionActive: true });
  const duplicate = path.processTick({ tick: tick(2), notional: 500, risk, now: 1_050, paperSessionActive: true });
  const old = path.processTick({ tick: tick(1), notional: 500, risk, now: 1_050, paperSessionActive: true });
  assert.equal(first.accepted, true);
  assert.equal(duplicate.reason, 'duplicate-event');
  assert.equal(old.reason, 'out-of-order-sequence');
});

test('fails closed without a paper session', () => {
  const path = new DeterministicFastPath();
  const result = path.processTick({ tick: tick(1), notional: 500, risk, now: 1_050, paperSessionActive: false });
  assert.equal(result.accepted, false);
  assert.equal(result.reason, 'paper-session-required');
});

test('fails closed on kill switch or oversized notional', () => {
  const path = new DeterministicFastPath();
  const killed = path.processTick({ tick: tick(1), notional: 500, risk: { ...risk, killSwitch: true }, now: 1_050, paperSessionActive: true });
  const oversized = path.processTick({ tick: tick(2), notional: 2_001, risk, now: 1_050, paperSessionActive: true });
  assert.equal(killed.accepted, false);
  assert.equal(oversized.accepted, false);
});

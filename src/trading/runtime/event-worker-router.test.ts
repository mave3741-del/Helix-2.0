import test from 'node:test';
import assert from 'node:assert/strict';
import { TradingEventBus, createTradingEvent } from './event-bus.ts';
import { InMemoryTaskQueue } from './task-queue.ts';
import { TradingEventWorkerRouter } from './event-worker-router.ts';

test('routes allowlisted strategic events with deterministic task ids', async () => {
  const events = new TradingEventBus();
  const queue = new InMemoryTaskQueue();
  const router = new TradingEventWorkerRouter({ events, queue });
  const event = createTradingEvent('news.market-moving', 'feed', { market: 'equities', headline: 'CPI' }, 1000, 'evt-news-1');

  const published = await events.publish(event);
  assert.equal(published, true);
  const task = await queue.getById('event-task:evt-news-1');
  assert.equal(task?.type, 'event.analyze');
  assert.equal(task?.priority, 800);
  assert.equal(task?.workerId, null);
  router.close();
});

test('raw market ticks are intentionally not routed to worker tasks', async () => {
  const events = new TradingEventBus();
  const queue = new InMemoryTaskQueue();
  const router = new TradingEventWorkerRouter({ events, queue });
  await events.publish(createTradingEvent('market.tick', 'market-runtime', { symbol: 'BTCUSDT', market: 'crypto' }, 2000, 'evt-tick-1'));
  assert.equal(await queue.getById('event-task:evt-tick-1'), null);
  router.close();
});

test('duplicate event delivery is idempotent at router and queue boundaries', async () => {
  const events = new TradingEventBus();
  const queue = new InMemoryTaskQueue();
  const router = new TradingEventWorkerRouter({ events, queue });
  const event = createTradingEvent('risk.alert', 'risk-engine', { market: 'crypto', code: 'drawdown' }, 3000, 'evt-risk-1');
  const first = await router.route(event);
  const second = await router.route(event);
  assert.equal(first.routed, true);
  assert.equal(second.routed, true);
  assert.equal(second.reason, 'duplicate');
  assert.deepEqual(second.task, first.task);
  assert.equal((await queue.peek(10)).length, 1);
  assert.equal((await queue.peek(10))[0]?.id, first.task?.id);
  router.close();
});

test('closing router removes event subscriptions', async () => {
  const events = new TradingEventBus();
  const queue = new InMemoryTaskQueue();
  const router = new TradingEventWorkerRouter({ events, queue });
  router.close();
  await events.publish(createTradingEvent('strategy.signal', 'strategy', { market: 'crypto', symbol: 'ETHUSDT' }, 4000, 'evt-strategy-1'));
  assert.equal(await queue.getById('event-task:evt-strategy-1'), null);
});

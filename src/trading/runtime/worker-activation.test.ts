import assert from 'node:assert/strict';
import test from 'node:test';
import { createTradingEvent, TradingEventBus } from './event-bus.ts';
import { InMemoryTaskResultStore } from './task-results.ts';
import { createInMemoryTradingWorkerActivation, TradingWorkerActivationService } from './worker-activation.ts';
import { TradingEventWorkerRouter } from './event-worker-router.ts';
import { InMemoryEvidenceStore } from '../evidence.ts';
import { InMemoryDebateStore } from '../debate.ts';
import { InMemoryWorkerReasoningTraceStore } from './reasoning-store.ts';
import { InMemoryTaskQueue } from './task-queue.ts';
import { InMemoryTradingWorkerRegistry } from './worker-registry.ts';
import { InMemoryNativeToolRegistryStore } from '../../runtime/tools/factory.ts';

async function make() {
  const events = new TradingEventBus();
  const service = createInMemoryTradingWorkerActivation({ events, supervisorOptions: { concurrency: 4 } });
  await service.bootstrap(1_000);
  return { events, service };
}

test('event routing produces an executable worker task and persists a result', async () => {
  const { events, service } = await make();
  await events.publish(createTradingEvent('risk.alert', 'risk-engine', { market: 'crypto', evidenceIds: ['ev-1'] }, 1_001, 'evt-risk-1'));
  const stats = await service.runOnce(Date.now() + 1_000);
  assert.equal(stats.claimed, 1);
  assert.equal(stats.completed, 1);
  const queued = (service as any).supervisor['queue'] as InMemoryTaskQueue;
  const task = await queued.getById('event-task:evt-risk-1');
  assert.equal(task?.status, 'completed');
  assert.equal(task?.type, 'event.analyze');
});

test('routing result keeps 1000-worker registry available and worker is released', async () => {
  const { events, service } = await make();
  await events.publish(createTradingEvent('strategy.signal', 'strategy-engine', { market: 'equities' }, 1_001, 'evt-strategy-1'));
  await service.runOnce(Date.now() + 1_000);
  const registry = (service as any).supervisor['registry'] as InMemoryTradingWorkerRegistry;
  const workers = await registry.list({ availableOnly: true });
  assert.equal(workers.length, 1000);
  assert.ok(workers.some((w) => w.completedTasks >= 1));
});

test('duplicate event remains idempotent', async () => {
  const { service } = await make();
  const event = createTradingEvent('news.market-moving', 'news', { market: 'equities' }, 1_001, 'evt-news-1');
  const first = await service.router.route(event);
  const second = await service.router.route(event);
  assert.equal(first.routed, true);
  assert.equal(second.reason, 'duplicate');
  await service.runOnce(Date.now() + 1_000);
  // We cannot list globally; the completed worker task itself is the evidence of one execution.
  const queue = (service as any).supervisor['queue'] as InMemoryTaskQueue;
  const task = await queue.getById('event-task:evt-news-1');
  assert.equal(task?.attempts, 1);
});

test('activation service can reuse an authoritative runtime queue/router', async () => {
  const events = new TradingEventBus();
  const queue = new InMemoryTaskQueue();
  const router = new TradingEventWorkerRouter({ events, queue });
  const service = new TradingWorkerActivationService({
    events,
    options: {
      queue,
      router,
      registry: new InMemoryTradingWorkerRegistry(),
      results: new InMemoryTaskResultStore(),
      evidence: new InMemoryEvidenceStore(),
      debateStore: new InMemoryDebateStore(),
      reasoningStore: new InMemoryWorkerReasoningTraceStore(),
      nativeToolStore: new InMemoryNativeToolRegistryStore(),
      nativeToolSeedMissingBuiltIns: true,
      supervisorOptions: { concurrency: 2 },
    },
  });
  await service.bootstrap(Date.now());
  await events.publish(createTradingEvent('risk.alert', 'risk-engine', { market: 'crypto' }, Date.now(), 'evt-shared-queue'));
  const stats = await service.runOnce(Date.now() + 1_000);
  assert.equal(stats.completed, 1);
  assert.equal((await queue.getById('event-task:evt-shared-queue'))?.status, 'completed');
  service.close();
});

test('server activation requires native registry reconciliation before worker bootstrap', async () => {
  const events = new TradingEventBus();
  const store = new InMemoryNativeToolRegistryStore();
  const service = new TradingWorkerActivationService({
    events,
    options: {
      queue: new InMemoryTaskQueue(),
      registry: new InMemoryTradingWorkerRegistry(),
      results: new InMemoryTaskResultStore(),
      evidence: new InMemoryEvidenceStore(),
      debateStore: new InMemoryDebateStore(),
      reasoningStore: new InMemoryWorkerReasoningTraceStore(),
      nativeToolStore: store,
      nativeToolSeedMissingBuiltIns: true,
    },
  });
  await service.bootstrap(1_000);
  const status = service.nativeToolRuntime.status();
  assert.ok(status);
  assert.equal(status?.blocked.length, 0);
  assert.equal(status?.drifted.length, 0);
  assert.equal(status?.deployed.length, 0);
  assert.ok((await store.get('native.rsi'))?.lifecycle === 'proposed');
  service.close();
});

test('service is explicit and never auto-started', async () => {
  const { service } = await make();
  assert.equal(service.isStarted(), false);
  service.start(25);
  assert.equal(service.isStarted(), true);
  await service.stop();
  assert.equal(service.isStarted(), false);
  service.close();
});

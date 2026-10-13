import test from "node:test";
import assert from "node:assert/strict";
import { InMemoryTaskQueue } from "./task-queue.ts";
import { InMemoryTradingWorkerRegistry } from "./worker-registry.ts";
import { InMemoryTaskResultStore } from "./task-results.ts";
import { TradingWorkerSupervisor, chooseWorker } from "./worker-supervisor.ts";

function task(id: string, payload: Record<string, unknown> = {}, priority = 0) {
  return { id, type: "research.scan", payload, priority, maxAttempts: 2 };
}

test("worker registry creates exactly 1,000 deterministic identities", async () => {
  const registry = new InMemoryTradingWorkerRegistry();
  assert.equal(await registry.ensureSeeded(1234), 1000);
  assert.equal((await registry.list()).length, 1000);
  const first = await registry.get("W-0001");
  assert.equal(first?.registryId, "WORKER-0001");
  assert.ok(first?.specializationName);
  assert.equal(await registry.ensureSeeded(5678), 0);
});

test("routing prefers requested family and capability, with deterministic tie-break", async () => {
  const registry = new InMemoryTradingWorkerRegistry();
  await registry.ensureSeeded(1);
  const all = await registry.list();
  const first = all[0]!;
  const target = all.find((w) => w.family === first.family && w.capabilities.length > 0) ?? first;
  const chosen = chooseWorker(all, {
    id: "route-1", type: "x", payload: { family: target.family, requiredCapability: target.capabilities[0] }, status: "queued",
    priority: 1, availableAt: 1, attempts: 0, maxAttempts: 2, workerId: null, leaseUntil: null, heartbeatAt: null,
    lastError: null, createdAt: 1, updatedAt: 1, completedAt: null,
  });
  assert.ok(chosen);
  assert.equal(chosen?.family, target.family);
  assert.equal(chosen?.capabilities.includes(target.capabilities[0]), true);
});

test("supervisor executes in bounded parallelism and persists provenance", async () => {
  const queue = new InMemoryTaskQueue();
  const registry = new InMemoryTradingWorkerRegistry();
  const results = new InMemoryTaskResultStore();
  let active = 0;
  let maxActive = 0;
  const supervisor = new TradingWorkerSupervisor({
    queue, registry, results, options: { concurrency: 4, leaseMs: 2_000, heartbeatMs: 500 },
    executor: async ({ task: queuedTask, worker }) => {
      active += 1; maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 25));
      active -= 1;
      return { ok: true, output: { taskId: queuedTask.id, workerId: worker.workerId }, tokens: 10, executor: "test" };
    },
  });
  await supervisor.bootstrap(1);
  for (let i = 0; i < 8; i += 1) await queue.enqueue(task(`t-${i}`, { requiredCapability: "trading", market: "crypto" }, 10 - i));
  const stats = await supervisor.runOnce(Date.now());
  assert.equal(stats.claimed, 4);
  assert.equal(stats.completed, 4);
  assert.ok(maxActive <= 4);
  const firstResult = await results.get("t-0", 1);
  assert.ok(firstResult);
  assert.equal(firstResult?.provenance.executor, "test");
  assert.match(firstResult?.provenanceHash ?? "", /^[0-9a-f]{8,64}$/);
  const available = (await registry.list({ availableOnly: true })).length;
  assert.equal(available, 1000);
});

test("failed execution is recorded and dead-letters at max attempts", async () => {
  const queue = new InMemoryTaskQueue();
  const registry = new InMemoryTradingWorkerRegistry();
  const results = new InMemoryTaskResultStore();
  const supervisor = new TradingWorkerSupervisor({
    queue, registry, results, options: { concurrency: 1, leaseMs: 2_000, heartbeatMs: 500 },
    executor: async () => ({ ok: false, output: { reason: "test failure" }, error: "forced_failure", executor: "test" }),
  });
  await supervisor.bootstrap(1);
  await queue.enqueue({ id: "dead-1", type: "x", payload: {}, maxAttempts: 1, availableAt: Date.now() });
  const stats = await supervisor.runOnce();
  assert.equal(stats.deadLettered, 1);
  assert.equal((await queue.getById("dead-1"))?.status, "dead_letter");
  assert.equal((await results.get("dead-1", 1))?.ok, false);
  assert.equal((await registry.get("W-0001"))?.failedTasks, 1);
});

test("long task renews its lease while executing", async () => {
  const queue = new InMemoryTaskQueue();
  const registry = new InMemoryTradingWorkerRegistry();
  const results = new InMemoryTaskResultStore();
  const supervisor = new TradingWorkerSupervisor({
    queue, registry, results, options: { concurrency: 1, leaseMs: 1_200, heartbeatMs: 500 },
    executor: async ({ task: queuedTask }) => {
      await new Promise((resolve) => setTimeout(resolve, 1_050));
      return { ok: true, output: queuedTask.id, executor: "lease-test" };
    },
  });
  await supervisor.bootstrap(1);
  await queue.enqueue({ id: "lease-1", type: "x", payload: {}, availableAt: Date.now() });
  const stats = await supervisor.runOnce();
  assert.equal(stats.completed, 1);
  assert.equal((await queue.getById("lease-1"))?.status, "completed");
});

test("supervisor bootstrap recovers a crashed worker after queue lease expiry", async () => {
  const queue = new InMemoryTaskQueue();
  const registry = new InMemoryTradingWorkerRegistry();
  const firstNow = 1_000;
  await registry.ensureSeeded(firstNow);
  const claimed = await queue.enqueue({ id: "crash-1", type: "news.event", payload: {}, availableAt: firstNow, maxAttempts: 3 });
  assert.equal(claimed.inserted, true);
  const staleWorker = "W-0001";
  const running = await queue.claim({ workerId: staleWorker, taskId: "crash-1", now: firstNow, leaseMs: 1_000 });
  assert.ok(running);
  assert.equal(await registry.markBusy(staleWorker, "crash-1", firstNow), true);
  const supervisor = new TradingWorkerSupervisor({
    queue, registry, results: new InMemoryTaskResultStore(),
    options: { concurrency: 1, leaseMs: 1_000, workerStaleMs: 1_000 },
    executor: async ({ task }) => ({ ok: true, output: { recovered: task.id }, executor: "recovery-test" }),
  });
  const stats = await supervisor.runOnce(2_001);
  assert.equal(stats.completed, 1);
  assert.equal((await queue.getById("crash-1"))?.status, "completed");
  assert.equal((await registry.get(staleWorker))?.status, "available");
});


test("supervisor lifecycle can start and stop its durable poll loop", async () => {
  const queue = new InMemoryTaskQueue();
  const registry = new InMemoryTradingWorkerRegistry();
  const results = new InMemoryTaskResultStore();
  const supervisor = new TradingWorkerSupervisor({
    queue, registry, results, options: { concurrency: 1 }, executor: async ({ task }) => ({ ok: true, output: task.id, executor: "lifecycle-test" }),
  });
  supervisor.start(25);
  assert.equal(supervisor.isStarted(), true);
  await supervisor.stop();
  assert.equal(supervisor.isStarted(), false);
});

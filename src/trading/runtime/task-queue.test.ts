import test from "node:test";
import assert from "node:assert/strict";
import { InMemoryTaskQueue, taskFromTradingEvent } from "./task-queue.ts";
import { createTradingEvent } from "./event-bus.ts";

test("queue is idempotent and preserves the original task", async () => {
  const queue = new InMemoryTaskQueue();
  const first = await queue.enqueue({ id: "t-1", type: "macro.scan", payload: { symbol: "BTCUSDT" }, priority: 3 });
  const second = await queue.enqueue({ id: "t-1", type: "macro.scan", payload: { symbol: "ETHUSDT" }, priority: 99 });
  assert.equal(first.inserted, true);
  assert.equal(second.inserted, false);
  assert.deepEqual(second.task.payload, { symbol: "BTCUSDT" });
});

test("claim uses priority and assigns a lease", async () => {
  const queue = new InMemoryTaskQueue();
  await queue.enqueue({ id: "low", type: "x", payload: {}, priority: 1, availableAt: 1_000 });
  await queue.enqueue({ id: "high", type: "x", payload: {}, priority: 5, availableAt: 1_000 });
  const task = await queue.claim({ workerId: "worker-7", now: 1_000, leaseMs: 10_000 });
  assert.equal(task?.id, "high");
  assert.equal(task?.status, "running");
  assert.equal(task?.workerId, "worker-7");
  assert.equal(task?.attempts, 1);
  assert.equal(task?.leaseUntil, 11_000);
});

test("heartbeat extends only the current worker lease", async () => {
  const queue = new InMemoryTaskQueue();
  await queue.enqueue({ id: "t-1", type: "x", payload: {}, availableAt: 1_000 });
  const claimed = await queue.claim({ workerId: "a", now: 1_000, leaseMs: 5_000 });
  assert.ok(claimed);
  assert.equal(await queue.heartbeat("t-1", "b", 2_000, 5_000), false);
  assert.equal(await queue.heartbeat("t-1", "a", 2_000, 5_000), true);
  assert.equal((await queue.getById("t-1"))?.leaseUntil, 7_000);
});

test("failure retries until max attempts, then dead-letters", async () => {
  const queue = new InMemoryTaskQueue();
  await queue.enqueue({ id: "t-1", type: "x", payload: {}, maxAttempts: 2, availableAt: 1_000 });
  await queue.claim({ workerId: "a", now: 1_000 });
  const first = await queue.fail("t-1", "a", "boom", { now: 1_100, retryDelayMs: 500 });
  assert.equal(first?.status, "queued");
  assert.equal(first?.attempts, 1);
  await queue.claim({ workerId: "a", now: 1_600 });
  const second = await queue.fail("t-1", "a", "boom-again", { now: 1_700 });
  assert.equal(second?.status, "dead_letter");
  assert.equal(second?.attempts, 2);
});

test("expired lease is recovered and can be claimed by another worker", async () => {
  const queue = new InMemoryTaskQueue();
  await queue.enqueue({ id: "t-1", type: "x", payload: {}, maxAttempts: 3, availableAt: 1_000 });
  await queue.claim({ workerId: "crashed", now: 1_000, leaseMs: 1_000 });
  assert.equal(await queue.recoverExpiredLeases(2_001), 1);
  const recovered = await queue.claim({ workerId: "replacement", now: 2_001, leaseMs: 1_000 });
  assert.equal(recovered?.workerId, "replacement");
  assert.equal(recovered?.attempts, 2);
});

test("event-to-task mapping infers durable routing hints", () => {
  const event = createTradingEvent("news.market-moving", "feed", { market: "equities", headline: "test" }, 1234, "evt-1");
  const task = taskFromTradingEvent(event);
  assert.equal(task.id, "task:evt-1");
  assert.deepEqual(task.routing, { market: "equities", family: "News", requiredCapability: "news" });
  assert.equal((taskFromTradingEvent(event, { routing: { market: "crypto" } }).routing?.market), "crypto");
});

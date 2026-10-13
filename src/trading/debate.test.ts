import test from "node:test";
import assert from "node:assert/strict";
import { DebateCoordinator, InMemoryDebateStore } from "./debate.ts";
import { InMemoryTaskQueue } from "./runtime/task-queue.ts";
import { InMemoryTradingWorkerRegistry } from "./runtime/worker-registry.ts";

test("debate creates sequential rounds and deterministic turn tasks", async () => {
  const registry = new InMemoryTradingWorkerRegistry();
  await registry.ensureSeeded(1000);
  const queue = new InMemoryTaskQueue();
  const coordinator = new DebateCoordinator(new InMemoryDebateStore(), registry, queue);
  const session = await coordinator.createSession({ sessionId: "debate-1", subjectId: "BTC", topic: "bull or bear?", maxParticipants: 4, now: 1000 });
  assert.equal(session.participants.length, 4);
  const opened = await coordinator.openRound(session.sessionId, 1, 1100);
  assert.equal(opened.tasks.length, 4);
  assert.deepEqual(opened.tasks.map((t) => t.id), [
    `debate-turn:${session.sessionId}:1:${session.participants[0]}`,
    `debate-turn:${session.sessionId}:1:${session.participants[1]}`,
    `debate-turn:${session.sessionId}:1:${session.participants[2]}`,
    `debate-turn:${session.sessionId}:1:${session.participants[3]}`,
  ]);
});

test("debate requires independent worker turns before close", async () => {
  const registry = new InMemoryTradingWorkerRegistry();
  await registry.ensureSeeded(1000);
  const queue = new InMemoryTaskQueue();
  const coordinator = new DebateCoordinator(new InMemoryDebateStore(), registry, queue);
  const session = await coordinator.createSession({ sessionId: "debate-2", subjectId: "ETH", topic: "setup", maxParticipants: 3, now: 1000 });
  await coordinator.openRound(session.sessionId, 1, 1100);
  await coordinator.recordTurn({ turnId: "t1", sessionId: session.sessionId, round: 1, workerId: session.participants[0], stance: "bull", argument: "trend confirmed", evidenceIds: ["e1"], confidence: 0.8, challengeOfTurnIds: [] , createdAt: 1200});
  await assert.rejects(() => coordinator.closeRound(session.sessionId, 1, 1300, 2), /debate_insufficient_turns/);
  await coordinator.recordTurn({ turnId: "t2", sessionId: session.sessionId, round: 1, workerId: session.participants[1], stance: "bear", argument: "regime risk", evidenceIds: ["e2"], confidence: 0.9, challengeOfTurnIds: ["t1"], createdAt: 1250});
  await coordinator.closeRound(session.sessionId, 1, 1300, 2);
  const finalized = await coordinator.finalize(session.sessionId, { stance: "neutral", confidence: 0.6, rationale: "conflicting evidence requires wait", evidenceIds: ["e1", "e2"], dissentWorkerIds: [session.participants[0], session.participants[1]] }, 1400);
  assert.equal(finalized.status, "finalized");
});

test("debate turn is idempotent per worker per round", async () => {
  const registry = new InMemoryTradingWorkerRegistry();
  await registry.ensureSeeded(1000);
  const queue = new InMemoryTaskQueue();
  const coordinator = new DebateCoordinator(new InMemoryDebateStore(), registry, queue);
  const session = await coordinator.createSession({ sessionId: "debate-3", subjectId: "SOL", topic: "setup", maxParticipants: 2, now: 1000 });
  await coordinator.openRound(session.sessionId, 1, 1100);
  const input = { turnId: "same", sessionId: session.sessionId, round: 1, workerId: session.participants[0], stance: "neutral" as const, argument: "wait", evidenceIds: [], confidence: 0.5, challengeOfTurnIds: [], createdAt: 1200 };
  assert.equal((await coordinator.recordTurn(input)).inserted, true);
  assert.equal((await coordinator.recordTurn({ ...input, argument: "changed", createdAt: 1300 })).inserted, false);
});

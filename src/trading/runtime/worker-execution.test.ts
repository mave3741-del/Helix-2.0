import test from "node:test";
import assert from "node:assert/strict";
import { buildEvidencePacket, InMemoryEvidenceStore } from "../evidence.ts";
import { DebateCoordinator, InMemoryDebateStore } from "../debate.ts";
import { InMemoryTaskQueue } from "./task-queue.ts";
import { InMemoryTradingWorkerRegistry } from "./worker-registry.ts";
import { TradingWorkerTaskEngine } from "./worker-execution.ts";
import { InMemoryWorkerReasoningTraceStore } from "./reasoning-store.ts";

test("worker engine executes persisted evidence review with a structured reasoning trace", async () => {
  const registry = new InMemoryTradingWorkerRegistry();
  await registry.ensureSeeded(1);
  const worker = (await registry.list({ family: "Fundamental" }))[0]!;
  const evidence = new InMemoryEvidenceStore();
  const packet = await buildEvidencePacket({ evidenceId: "e1", subjectId: "AAPL", evidenceType: "filing", claim: "guidance", confidence: 0.85, source: "sec", eventTs: 1000, retrievedTs: 1100, payload: { filing: "10-Q" } });
  await evidence.append(packet);
  const debates = new DebateCoordinator(new InMemoryDebateStore(), registry, new InMemoryTaskQueue());
  const engine = new TradingWorkerTaskEngine({ evidence, debates });
  const result = await engine.execute({ worker, task: { id: "r1", type: "evidence.review", payload: { evidence: packet }, status: "running", priority: 1, availableAt: 1, attempts: 1, maxAttempts: 3, workerId: worker.workerId, leaseUntil: 9999, heartbeatAt: 1, lastError: null, createdAt: 1, updatedAt: 1, completedAt: null } });
  assert.equal(result.ok, true);
  assert.equal((result.output as any).kind, "evidence-review");
  assert.equal((result.output as any).reasoning.evidenceIds[0], "e1");
});

test("worker engine records a debate turn from an assigned worker task", async () => {
  const registry = new InMemoryTradingWorkerRegistry();
  await registry.ensureSeeded(1);
  const worker = (await registry.list({ family: "Technical" }))[0]!;
  const evidence = new InMemoryEvidenceStore();
  const packet = await buildEvidencePacket({ evidenceId: "e2", subjectId: "BTC", evidenceType: "market", claim: "trend persistence", confidence: 0.82, source: "replay", eventTs: 1000, retrievedTs: 1100, payload: { symbol: "BTC" } });
  await evidence.append(packet);
  const store = new InMemoryDebateStore();
  const queue = new InMemoryTaskQueue();
  const coordinator = new DebateCoordinator(store, registry, queue);
  const session = await coordinator.createSession({ sessionId: "d1", subjectId: "BTC", topic: "trend continuation", councilIds: ["technical", "risk"], maxParticipants: 2, now: 1000 });
  await coordinator.openRound(session.sessionId, 1, 1100, ["e2"]);
  const engine = new TradingWorkerTaskEngine({ evidence, debates: coordinator });
  const result = await engine.execute({ worker, task: { id: `debate-turn:${session.sessionId}:1:${worker.workerId}`, type: "debate.turn", payload: { sessionId: session.sessionId, round: 1, topic: session.topic, workerId: worker.workerId, evidenceIds: ["e2"] }, status: "running", priority: 1, availableAt: 1, attempts: 1, maxAttempts: 3, workerId: worker.workerId, leaseUntil: 9999, heartbeatAt: 1, lastError: null, createdAt: 1, updatedAt: 1, completedAt: null } });
  assert.equal(result.ok, true);
  const turns = await store.listTurns(session.sessionId, 1);
  assert.equal(turns.length, 1);
  assert.equal(turns[0]?.workerId, worker.workerId);
  assert.equal(turns[0]?.evidenceIds[0], "e2");
});

test("worker engine runs through the durable supervisor path and persists the result", async () => {
  const { TradingWorkerSupervisor } = await import("./worker-supervisor.ts");
  const { InMemoryTaskResultStore } = await import("./task-results.ts");
  const registry = new InMemoryTradingWorkerRegistry();
  await registry.ensureSeeded(1);
  const worker = (await registry.list({ family: "Fundamental" }))[0]!;
  const evidence = new InMemoryEvidenceStore();
  const packet = await buildEvidencePacket({ evidenceId: "e-supervisor", subjectId: "AAPL", evidenceType: "filing", claim: "guidance update", confidence: 0.9, source: "sec", eventTs: 1000, retrievedTs: 1100, payload: { filing: "8-K" } });
  await evidence.append(packet);
  const queue = new InMemoryTaskQueue();
  const debates = new DebateCoordinator(new InMemoryDebateStore(), registry, queue);
  const engine = new TradingWorkerTaskEngine({ evidence, debates });
  const results = new InMemoryTaskResultStore();
  const supervisor = new TradingWorkerSupervisor({ queue, registry, results, options: { concurrency: 1, leaseMs: 2000, heartbeatMs: 500 }, executor: (ctx) => engine.execute(ctx) });
  await supervisor.bootstrap(1);
  await queue.enqueue({ id: "review-supervisor", type: "evidence.review", payload: { evidence: packet }, routing: { preferredWorkerId: worker.workerId }, availableAt: Date.now(), maxAttempts: 2 });
  const stats = await supervisor.runOnce(Date.now());
  assert.equal(stats.completed, 1);
  const stored = await results.get("review-supervisor", 1);
  assert.equal(stored?.ok, true);
  assert.equal((stored?.output as any).kind, "evidence-review");
  assert.equal((stored?.output as any).workerId, worker.workerId);
});

test("worker tool policy rejects a capability it does not own", async () => {
  const registry = new InMemoryTradingWorkerRegistry();
  await registry.ensureSeeded(1);
  const worker = (await registry.list({ family: "Technical" }))[0]!;
  const evidence = new InMemoryEvidenceStore();
  const debates = new DebateCoordinator(new InMemoryDebateStore(), registry, new InMemoryTaskQueue());
  const engine = new TradingWorkerTaskEngine({ evidence, debates });
  const task = { id: "forbidden", type: "risk.check", payload: { side: "buy", qty: 1, price: 100, limits: { capital: 10000, maxPositionPct: 0.2, maxOrderPct: 0.1, maxDailyLossPct: 0.02, maxDrawdownPct: 0.1, maxLeverage: 1 }, dailyPnl: 0, equity: 10000 }, status: "running" as const, priority: 1, availableAt: 1, attempts: 1, maxAttempts: 1, workerId: worker.workerId, leaseUntil: 9999, heartbeatAt: 1, lastError: null, createdAt: 1, updatedAt: 1, completedAt: null };
  await assert.rejects(() => engine.execute({ worker, task }), /worker_tool_not_allowed:risk.check/);
});

test("worker engine executes a native technical tool through its capability boundary", async () => {
  const registry = new InMemoryTradingWorkerRegistry();
  await registry.ensureSeeded(1);
  const worker = (await registry.list({ family: "Technical" }))[0]!;
  const evidence = new InMemoryEvidenceStore();
  const debates = new DebateCoordinator(new InMemoryDebateStore(), registry, new InMemoryTaskQueue());
  const engine = new TradingWorkerTaskEngine({ evidence, debates });
  const bars = Array.from({ length: 35 }, (_, i) => ({ ts: i + 1, open: 100 + i, high: 101 + i, low: 99 + i, close: 100 + i, volume: 1000 }));
  const task = { id: "technical-1", type: "technical.signal", payload: { bars, fast: 5, slow: 20 }, status: "running" as const, priority: 1, availableAt: 1, attempts: 1, maxAttempts: 1, workerId: worker.workerId, leaseUntil: 9999, heartbeatAt: 1, lastError: null, createdAt: 1, updatedAt: 1, completedAt: null };
  const result = await engine.execute({ worker, task });
  assert.equal(result.ok, true);
  assert.equal((result.output as any).kind, "technical-signal");
  assert.equal((result.output as any).toolCalls[0].tool, "technical.signal");
});


test("worker engine schedules and records adversarial debate critique", async () => {
  const store = new InMemoryDebateStore();
  const registry = new InMemoryTradingWorkerRegistry();
  const queue = new InMemoryTaskQueue();
  const evidence = new InMemoryEvidenceStore();
  const coordinator = new DebateCoordinator(store, registry, queue);
  const reasoningStore = new InMemoryWorkerReasoningTraceStore();
  await registry.ensureSeeded(2);
  const workers = await registry.list({ availableOnly: true });
  const session = await coordinator.createSession({ sessionId:"critique-session", subjectId:"BTC", topic:"test topic", maxParticipants:2 });
  const evidenceId = "crit-e1";
  await evidence.append({ evidenceId, subjectId:"BTC", evidenceType:"test", claim:"support", confidence:.8, source:"test", eventTs:1, publishedTs:1, retrievedTs:1, payload:{}, provenance:{source:"test"}, contentHash:"h" });
  const round = await coordinator.openRound(session.sessionId,1,Date.now(),[evidenceId]);
  const engine = new TradingWorkerTaskEngine({ evidence, debates:coordinator, reasoningStore });
  for (const task of round.tasks) {
    const taskPayload:any = task.payload as any;
    const worker = await registry.get(taskPayload?.data?.workerId ?? taskPayload?.workerId ?? task.workerId ?? workers[0]?.workerId);
    if (worker) await engine.execute({ task, worker, now:Date.now() } as any);
  }
  const critiques = await coordinator.scheduleCritiques(session.sessionId,1,[evidenceId]);
  assert.equal(critiques.length,2);
  for (const task of critiques) {
    const taskPayload:any = task.payload as any;
    const worker = await registry.get(taskPayload?.data?.workerId ?? taskPayload?.workerId);
    if (worker) { const result = await engine.execute({ task, worker, now:Date.now() } as any); assert.equal(result.ok,true); }
  }
  assert.ok((await store.listTurns(session.sessionId,1)).some((t)=>t.challengeOfTurnIds.length>0));
});


test("worker trade execution requires explicit owner approval and paper session", async () => {
  const { AgentTradeGateway } = await import("../execution/agent-trade-gateway.ts");
  const calls: string[] = [];
  const connector = {
    id: "paper-test", mode: "paper" as const,
    async account() { return { id: "a", currency: "USD", status: "ACTIVE", buyingPower: 1000, cash: 1000, portfolioValue: 1000, equity: 1000 }; },
    async markets() { return []; }, async positions() { return []; }, async orders() { return []; },
    async placeOrder(order: any) { calls.push(order.clientOrderId); return { id: "o1", clientOrderId: order.clientOrderId, symbol: order.symbol, side: order.side, type: order.type ?? "market", qty: order.qty ?? 0, filledQty: 0, status: "new" as const }; },
    async cancelOrder() {},
  };
  const gateway = new AgentTradeGateway(connector);
  const evidence = new InMemoryEvidenceStore();
  const debates = new DebateCoordinator(new InMemoryDebateStore(), new InMemoryTradingWorkerRegistry(), new InMemoryTaskQueue());
  const engine = new TradingWorkerTaskEngine({ evidence, debates, tradeGateway: gateway });
  const worker = { workerId: "w-trader", family: "execution", specializationName: "Execution Agent", capabilities: ["trading"] } as any;
  const task = (payload: any) => ({ id: "trade-safe", type: "trade.execute", payload, status: "running", priority: 1, availableAt: 1, attempts: 1, maxAttempts: 1, workerId: worker.workerId, leaseUntil: 9999, heartbeatAt: 1, lastError: null, createdAt: 1, updatedAt: 1, completedAt: null } as any);
  const denied = await engine.execute({ worker, task: task({ symbol: "BTC/USD", side: "buy", qty: 1, riskApproved: true }) });
  assert.equal(denied.ok, false); assert.equal(calls.length, 0);
  const accepted = await engine.execute({ worker, task: task({ symbol: "BTC/USD", side: "buy", qty: 1, riskApproved: true, ownerApproved: true, paperSessionId: "s1" }) });
  assert.equal(accepted.ok, true); assert.equal(calls.length, 1);
});

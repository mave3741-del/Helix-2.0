import test from "node:test";
import assert from "node:assert/strict";
import { getServerTradingRuntime, ServerTradingRuntime } from "./runtime.ts";
import { ReplayMarketAdapter } from "../data/adapters.ts";
import { InMemoryMarketTickRecorder, InMemoryTradingEventJournal } from "./journal.ts";
import { InMemoryTaskQueue } from "./task-queue.ts";
import { InMemoryRuntimeSnapshotStore } from "./snapshot.ts";
import { PaperOperationSession } from "../ops/paper-operations.ts";
import { InMemoryStrategyPerformanceStore } from "../post-trade.ts";

function activePaperSession(id = "test-paper-session") { const session = new PaperOperationSession({ sessionId: id, readinessReady: true, ownerApprovalActive: true, liveExecutionEnabled: false }); session.arm(1); session.start(2); return session; }

test("paper runtime applies an independent risk gate before fills", async () => {
  const runtime = new ServerTradingRuntime({ paperOperationSession: activePaperSession(),  capital: 10_000, risk: { capital: 10_000, maxPositionPct: 0.2, maxOrderPct: 0.02, maxDailyLossPct: 0.02, maxDrawdownPct: 0.1, maxLeverage: 2 } }, new InMemoryTradingEventJournal(), new InMemoryMarketTickRecorder(), new InMemoryTaskQueue(), new InMemoryRuntimeSnapshotStore());
  const tick = { symbol: "BTCUSDT", venue: "paper", market: "crypto" as const, bid: 100, ask: 101, last: 100.5, bidSize: 20, askSize: 10, sequence: 1, exchangeTs: 1000, receivedTs: 1001 };
  await assert.rejects(() => runtime.paperOrder({ clientOrderId: "bad", symbol: "BTCUSDT", side: "buy", qty: 3, tick }), /risk_veto/);
  const fill = await runtime.paperOrder({ clientOrderId: "ok", symbol: "BTCUSDT", side: "buy", qty: 1, tick });
  assert.ok(fill.price > 101);
  assert.equal(runtime.paper.snapshot().positions.BTCUSDT.qty, 1);
});

test("paper runtime kill switch blocks execution immediately", async () => {
  const runtime = new ServerTradingRuntime({ paperOperationSession: activePaperSession(),  capital: 10_000, risk: { capital: 10_000, maxPositionPct: 0.2, maxOrderPct: 0.02, maxDailyLossPct: 0.02, maxDrawdownPct: 0.1, maxLeverage: 2 } }, new InMemoryTradingEventJournal(), new InMemoryMarketTickRecorder(), new InMemoryTaskQueue(), new InMemoryRuntimeSnapshotStore());
  await runtime.setKillSwitch(true);
  const tick = { symbol: "BTCUSDT", venue: "paper", market: "crypto" as const, bid: 100, ask: 101, last: 100.5, bidSize: 20, askSize: 10, sequence: 1, exchangeTs: 1000, receivedTs: 1001 };
  await assert.rejects(() => runtime.paperOrder({ clientOrderId: "x", symbol: "BTCUSDT", side: "buy", qty: 1, tick }), /kill_switch_active/);
});

test("replay adapter delivers market ticks in timestamp order", async () => {
  const ticks = [
    { symbol: "BTCUSDT", venue: "paper", market: "crypto" as const, bid: 102, ask: 103, last: 102.5, bidSize: 2, askSize: 2, sequence: 3, exchangeTs: 3, receivedTs: 3 },
    { symbol: "BTCUSDT", venue: "paper", market: "crypto" as const, bid: 100, ask: 101, last: 100.5, bidSize: 2, askSize: 2, sequence: 1, exchangeTs: 1, receivedTs: 1 },
  ];
  const adapter = new ReplayMarketAdapter("replay", "paper", ticks);
  const seen: number[] = [];
  await adapter.connect((tick) => { seen.push(tick.sequence); });
  assert.deepEqual(seen, [1, 3]);
});

test("server singleton stays process-local and deterministic for a deployment instance", () => {
  const a = getServerTradingRuntime();
  const b = getServerTradingRuntime();
  assert.equal(a, b);
});


test("market ticks and paper fills enter the durable-journal interface", async () => {
  const journal = new InMemoryTradingEventJournal();
  const runtime = new ServerTradingRuntime({ paperOperationSession: activePaperSession(),  capital: 10_000, risk: { capital: 10_000, maxPositionPct: 0.2, maxOrderPct: 0.02, maxDailyLossPct: 0.02, maxDrawdownPct: 0.1, maxLeverage: 2 } }, journal, new InMemoryMarketTickRecorder(), new InMemoryTaskQueue(), new InMemoryRuntimeSnapshotStore());
  const tick = { symbol: "BTCUSDT", venue: "paper", market: "crypto" as const, bid: 100, ask: 101, last: 100.5, bidSize: 20, askSize: 10, sequence: 7, exchangeTs: 1000, receivedTs: 1001 };
  await runtime.onMarketTick(tick);
  await runtime.paperOrder({ clientOrderId: "journal-1", symbol: "BTCUSDT", side: "buy", qty: 1, tick });
  const events = await journal.list();
  assert.deepEqual(events.map((x) => x.type), ["market.tick", "paper.order.filled"]);
  assert.equal((events[0].payload as typeof tick).sequence, 7);
});


test("paper fill events are durably routed into the worker task queue", async () => {
  const queue = new InMemoryTaskQueue();
  const runtime = new ServerTradingRuntime({ paperOperationSession: activePaperSession(), capital: 10_000, risk: { capital: 10_000, maxPositionPct: 0.2, maxOrderPct: 0.02, maxDailyLossPct: 0.02, maxDrawdownPct: 0.1, maxLeverage: 2 }, slippageBps: 0 }, new InMemoryTradingEventJournal(), new InMemoryMarketTickRecorder(), queue, new InMemoryRuntimeSnapshotStore());
  const tick = { symbol: "BTCUSDT", venue: "paper", market: "crypto" as const, bid: 100, ask: 101, last: 100.5, bidSize: 20, askSize: 10, sequence: 17, exchangeTs: 4000, receivedTs: 4001 };
  await runtime.paperOrder({ clientOrderId: "router-fill-1", symbol: "BTCUSDT", side: "buy", qty: 1, tick });
  const queued = (await queue.peek(20)).find((task) => task.type === "event.analyze");
  assert.equal(queued?.type, "event.analyze");
  assert.equal(((queued?.payload as any)?.data?.payload?.clientOrderId), "router-fill-1");
});

test("retries are idempotent for market ticks and paper orders", async () => {
  const journal = new InMemoryTradingEventJournal();
  const runtime = new ServerTradingRuntime({ paperOperationSession: activePaperSession(),  capital: 10_000, risk: { capital: 10_000, maxPositionPct: 0.2, maxOrderPct: 0.02, maxDailyLossPct: 0.02, maxDrawdownPct: 0.1, maxLeverage: 2 } }, journal, new InMemoryMarketTickRecorder(), new InMemoryTaskQueue(), new InMemoryRuntimeSnapshotStore());
  const tick = { symbol: "BTCUSDT", venue: "paper", market: "crypto" as const, bid: 100, ask: 101, last: 100.5, bidSize: 20, askSize: 10, sequence: 9, exchangeTs: 2000, receivedTs: 2001 };
  await runtime.onMarketTick(tick);
  await runtime.onMarketTick(tick);
  const first = await runtime.paperOrder({ clientOrderId: "retry-1", symbol: "BTCUSDT", side: "buy", qty: 1, tick });
  const second = await runtime.paperOrder({ clientOrderId: "retry-1", symbol: "BTCUSDT", side: "buy", qty: 1, tick });
  assert.deepEqual(second, first);
  assert.equal(runtime.paper.snapshot().positions.BTCUSDT.qty, 1);
  assert.equal((await journal.list()).filter((x) => x.type === "market.tick").length, 1);
  assert.equal((await journal.list()).filter((x) => x.type === "paper.order.filled").length, 1);
});


test("paper runtime supports an open limit order that fills across later ticks", async () => {
  const journal = new InMemoryTradingEventJournal();
  const runtime = new ServerTradingRuntime({ paperOperationSession: activePaperSession(),  capital: 10_000, risk: { capital: 10_000, maxPositionPct: 0.2, maxOrderPct: 0.02, maxDailyLossPct: 0.02, maxDrawdownPct: 0.1, maxLeverage: 2 }, slippageBps: 0 }, journal, new InMemoryMarketTickRecorder(), new InMemoryTaskQueue(), new InMemoryRuntimeSnapshotStore());
  const first = { symbol: "ETHUSDT", venue: "paper", market: "crypto" as const, bid: 99, ask: 101, last: 100, bidSize: 10, askSize: 10, sequence: 1, exchangeTs: 1000, receivedTs: 1001 };
  const order = await runtime.paperLimitOrder({ clientOrderId: "limit-runtime", symbol: "ETHUSDT", side: "buy", qty: 2, limitPrice: 99.5, tick: first });
  assert.equal(order.status, "open");
  await runtime.onMarketTick({ ...first, sequence: 2, exchangeTs: 1100, receivedTs: 1101, bid: 98.5, ask: 99, last: 98.8, askSize: 1 });
  assert.equal(runtime.paper.getOrder("limit-runtime")?.status, "partially_filled");
  await runtime.onMarketTick({ ...first, sequence: 3, exchangeTs: 1200, receivedTs: 1201, bid: 98.5, ask: 99, last: 98.9, askSize: 1 });
  assert.equal(runtime.paper.getOrder("limit-runtime")?.status, "filled");
  assert.equal(runtime.paper.snapshot().positions.ETHUSDT.qty, 2);
});

test("paper mark-to-market updates equity between fills", async () => {
  const runtime = new ServerTradingRuntime({ paperOperationSession: activePaperSession(),  capital: 10_000, risk: { capital: 10_000, maxPositionPct: 0.2, maxOrderPct: 0.02, maxDailyLossPct: 0.02, maxDrawdownPct: 0.1, maxLeverage: 2 }, slippageBps: 0 }, new InMemoryTradingEventJournal(), new InMemoryMarketTickRecorder(), new InMemoryTaskQueue(), new InMemoryRuntimeSnapshotStore());
  const tick = { symbol: "BTCUSDT", venue: "paper", market: "crypto" as const, bid: 100, ask: 100.5, last: 100, bidSize: 10, askSize: 10, sequence: 1, exchangeTs: 1000, receivedTs: 1000 };
  await runtime.paperOrder({ clientOrderId: "mtm", symbol: "BTCUSDT", side: "buy", qty: 1, tick });
  const before = runtime.paper.snapshot().equity;
  await runtime.onMarketTick({ ...tick, sequence: 2, exchangeTs: 1100, receivedTs: 1100, bid: 110, ask: 110.5, last: 110 });
  assert.ok(runtime.paper.snapshot().equity > before);
});


test("server runtime exposes the durable worker queue boundary", async () => {
  const queue = new InMemoryTaskQueue();
  const runtime = new ServerTradingRuntime({ paperOperationSession: activePaperSession(),  capital: 10_000, risk: { capital: 10_000, maxPositionPct: 0.2, maxOrderPct: 0.02, maxDailyLossPct: 0.02, maxDrawdownPct: 0.1, maxLeverage: 2 } }, new InMemoryTradingEventJournal(), new InMemoryMarketTickRecorder(), queue, new InMemoryRuntimeSnapshotStore());
  const task = await runtime.enqueueWorkerTask({ id: "task-1", type: "worker.market-analysis", payload: { symbol: "BTCUSDT" }, priority: 10 });
  assert.equal(task.id, "task-1");
  assert.equal(task.type, "worker.market-analysis");
  const claimed = await queue.claim({ workerId: "worker-1", now: task.availableAt, leaseMs: 10_000 });
  assert.equal(claimed?.id, "task-1");
});


test("runtime snapshot restores paper account, open orders, risk state, and event cursor", async () => {
  const journal = new InMemoryTradingEventJournal();
  const recorder = new InMemoryMarketTickRecorder();
  const queue = new InMemoryTaskQueue();
  const snapshots = new InMemoryRuntimeSnapshotStore();
  const config = { paperOperationSession: activePaperSession(), capital: 10_000, risk: { capital: 10_000, maxPositionPct: 0.2, maxOrderPct: 0.02, maxDailyLossPct: 0.02, maxDrawdownPct: 0.1, maxLeverage: 2 }, slippageBps: 0, runtimeId: "recovery-test", snapshotIntervalMs: 250 };
  const first = new ServerTradingRuntime(config, journal, recorder, queue, snapshots);
  const tick = { symbol: "BTCUSDT", venue: "paper", market: "crypto" as const, bid: 100, ask: 100.5, last: 100.25, bidSize: 10, askSize: 10, sequence: 11, exchangeTs: 1_000, receivedTs: 1_001 };
  await first.paperOrder({ clientOrderId: "recover-fill", symbol: "BTCUSDT", side: "buy", qty: 1, tick });
  await first.paperLimitOrder({ clientOrderId: "recover-open", symbol: "BTCUSDT", side: "buy", qty: 2, limitPrice: 99, tick });
  await first.setCapitalLimit(8_000);
  await first.setKillSwitch(true);
  await first.persistSnapshot(2_000);
  await first.onMarketTick({ ...tick, sequence: 12, exchangeTs: 3_400, receivedTs: 3_401, bid: 105, ask: 105.5, last: 105.25 });

  const second = new ServerTradingRuntime(config, journal, recorder, queue, snapshots);
  assert.equal(await second.recoverFromSnapshot(), true);
  assert.deepEqual(second.snapshot(), first.snapshot());
  assert.deepEqual(second.paper.snapshot(), first.paper.snapshot());
  assert.deepEqual(second.paper.getOrder("recover-open"), first.paper.getOrder("recover-open"));
});

test("runtime recovery is false when no snapshot exists", async () => {
  const runtime = new ServerTradingRuntime({ paperOperationSession: activePaperSession(),  capital: 10_000, risk: { capital: 10_000, maxPositionPct: 0.2, maxOrderPct: 0.02, maxDailyLossPct: 0.02, maxDrawdownPct: 0.1, maxLeverage: 2 }, runtimeId: "missing-snapshot" }, new InMemoryTradingEventJournal(), new InMemoryMarketTickRecorder(), new InMemoryTaskQueue(), new InMemoryRuntimeSnapshotStore());
  assert.equal(await runtime.recoverFromSnapshot(), false);
});

test("runtime rejects a second pending limit order when combined exposure would exceed the position cap", async () => {
  const runtime = new ServerTradingRuntime({ paperOperationSession: activePaperSession(),  capital: 10_000, risk: { capital: 10_000, maxPositionPct: 0.2, maxOrderPct: 0.2, maxDailyLossPct: 0.02, maxDrawdownPct: 0.2, maxLeverage: 2 }, slippageBps: 0 }, new InMemoryTradingEventJournal(), new InMemoryMarketTickRecorder(), new InMemoryTaskQueue(), new InMemoryRuntimeSnapshotStore());
  const tick = { symbol: "ETHUSDT", venue: "paper", market: "crypto" as const, bid: 99, ask: 101, last: 100, bidSize: 100, askSize: 100, sequence: 1, exchangeTs: 1000, receivedTs: 1000 };
  const first = await runtime.paperLimitOrder({ clientOrderId: "pending-1", symbol: "ETHUSDT", side: "buy", qty: 10, limitPrice: 100, tick });
  assert.equal(first.status, "open");
  const second = await runtime.paperLimitOrder({ clientOrderId: "pending-2", symbol: "ETHUSDT", side: "buy", qty: 10, limitPrice: 100, tick });
  assert.equal(second.status, "open");
  await assert.rejects(() => runtime.paperLimitOrder({ clientOrderId: "pending-3", symbol: "ETHUSDT", side: "buy", qty: 1, limitPrice: 100, tick }), /position_limit_exceeded/);
});

test("runtime vetoes new execution after the hard drawdown threshold is reached", async () => {
  const runtime = new ServerTradingRuntime({ paperOperationSession: activePaperSession(),  capital: 1_000, risk: { capital: 1_000, maxPositionPct: 1, maxOrderPct: 1, maxDailyLossPct: 0.5, maxDrawdownPct: 0.1, maxLeverage: 2 }, slippageBps: 0 }, new InMemoryTradingEventJournal(), new InMemoryMarketTickRecorder(), new InMemoryTaskQueue(), new InMemoryRuntimeSnapshotStore());
  const firstTick = { symbol: "BTCUSDT", venue: "paper", market: "crypto" as const, bid: 100, ask: 100, last: 100, bidSize: 100, askSize: 100, sequence: 1, exchangeTs: 1000, receivedTs: 1000 };
  await runtime.paperOrder({ clientOrderId: "drawdown-seed", symbol: "BTCUSDT", side: "buy", qty: 9, tick: firstTick });
  await runtime.onMarketTick({ ...firstTick, bid: 88, ask: 88, last: 88, sequence: 2, exchangeTs: 1100, receivedTs: 1100 });
  assert.ok(runtime.snapshot().peakEquity >= 1_000);
  await assert.rejects(() => runtime.paperOrder({ clientOrderId: "drawdown-blocked", symbol: "BTCUSDT", side: "buy", qty: 1, tick: { ...firstTick, sequence: 3, exchangeTs: 1200, receivedTs: 1200 } }), /max_drawdown_exceeded/);
});


test("halted cycle health blocks paper admission fail-closed", async () => {
  const runtime = new ServerTradingRuntime({ paperOperationSession: activePaperSession(),  capital: 100_000, risk: { capital: 100_000, maxPositionPct: 0.1, maxOrderPct: 0.02, maxDailyLossPct: 0.02, maxDrawdownPct: 0.1, maxLeverage: 2 } });
  const tick = { symbol: "BTCUSDT", venue: "paper", market: "crypto" as const, bid: 100, ask: 101, last: 100.5, bidSize: 20, askSize: 10, sequence: 1, exchangeTs: 1000, receivedTs: 1001 };
  runtime.setCycleHealth({ cycleId:"cycle-halt", status:"halted", score:0, reasons:["watchdog_halted"], decisionHash:"hash" });
  await assert.rejects(() => runtime.paperOrder({ clientOrderId:"health-block", symbol:"BTCUSDT", side:"buy", qty:1, tick }), /operational_cycle_health_halted/);
});

test("degraded cycle health does not bypass existing risk admission", async () => {
  const runtime = new ServerTradingRuntime({ paperOperationSession: activePaperSession(),  capital: 100_000, risk: { capital: 100_000, maxPositionPct: 0.1, maxOrderPct: 0.02, maxDailyLossPct: 0.02, maxDrawdownPct: 0.1, maxLeverage: 2 } }, new InMemoryTradingEventJournal(), new InMemoryMarketTickRecorder(), new InMemoryTaskQueue(), new InMemoryRuntimeSnapshotStore());
  const tick = { symbol: "BTCUSDT", venue: "paper", market: "crypto" as const, bid: 100, ask: 101, last: 100.5, bidSize: 20, askSize: 10, sequence: 1, exchangeTs: 1000, receivedTs: 1001 };
  runtime.setCycleHealth({ cycleId:"cycle-degraded", status:"degraded", score:0.8, reasons:["quote_freshness_below_threshold"], decisionHash:"hash" });
  const fill = await runtime.paperOrder({ clientOrderId:"health-degraded", symbol:"BTCUSDT", side:"buy", qty:1, tick });
  assert.equal(fill.symbol, "BTCUSDT");
});

test("paper runtime rejects direct paper orders without a running operation session", async () => {
  const runtime = new ServerTradingRuntime({ capital: 10_000, risk: { capital: 10_000, maxPositionPct: 0.2, maxOrderPct: 0.02, maxDailyLossPct: 0.02, maxDrawdownPct: 0.1, maxLeverage: 2 } }, new InMemoryTradingEventJournal(), new InMemoryMarketTickRecorder(), new InMemoryTaskQueue(), new InMemoryRuntimeSnapshotStore());
  const tick = { symbol: "BTCUSDT", venue: "paper", market: "crypto" as const, bid: 100, ask: 101, last: 100.5, bidSize: 20, askSize: 10, sequence: 1, exchangeTs: 1000, receivedTs: 1001 };
  await assert.rejects(() => runtime.paperOrder({ clientOrderId: "session-required", symbol: "BTCUSDT", side: "buy", qty: 1, tick }), /paper_operation_session_required/);
  const paused = new PaperOperationSession({ sessionId: "paused-session", readinessReady: true, ownerApprovalActive: true, liveExecutionEnabled: false });
  paused.arm(1);
  runtime.attachPaperOperationSession(paused);
  await assert.rejects(() => runtime.paperOrder({ clientOrderId: "paused", symbol: "BTCUSDT", side: "buy", qty: 1, tick }), /paper_operation_session_not_running:armed/);
});


test("scale-in recomputes unrealized PnL from the latest mark immediately", async () => {
  const runtime = new ServerTradingRuntime(
    { paperOperationSession: activePaperSession(), capital: 100000, risk: { capital: 100000, maxOrderPct: 1, maxPositionPct: 1, maxLeverage: 10, maxDrawdownPct: 1, maxDailyLossPct: 1 }, feeBps: 0, slippageBps: 0, performanceStore: new InMemoryStrategyPerformanceStore() },
    new InMemoryTradingEventJournal(),
    new InMemoryMarketTickRecorder(),
    new InMemoryTaskQueue(),
    new InMemoryRuntimeSnapshotStore(),
  );
  const t1 = { symbol: 'BTCUSDT', venue: 'paper', market: 'crypto' as const, bid: 99, ask: 101, last: 100, bidSize: 100, askSize: 100, sequence: 1, exchangeTs: 1000, receivedTs: 1000 };
  const firstFill = await runtime.paperOrder({ clientOrderId: 'scale-1', symbol: 'BTCUSDT', side: 'buy', qty: 10, tick: t1 });
  const t2 = { ...t1, bid: 109, ask: 111, last: 110, sequence: 2, exchangeTs: 2000, receivedTs: 2000 };
  const before = runtime.paper.snapshot();
  assert.equal(before.positions.BTCUSDT.qty, 10);
  await runtime.paperOrder({ clientOrderId: 'scale-2', symbol: 'BTCUSDT', side: 'buy', qty: 10, tick: t2 });
  const secondFill = runtime.paper.listFills('scale-2')[0]!;
  const after = runtime.paper.snapshot();
  const expectedAvg = (firstFill.qty * firstFill.price + secondFill.qty * secondFill.price) / 20;
  assert.ok(Math.abs(after.positions.BTCUSDT.avgPrice - expectedAvg) < 1e-12);
  assert.ok(Math.abs(after.positions.BTCUSDT.unrealizedPnl - (20 * (110 - expectedAvg))) < 1e-9);
  assert.equal(after.equity, after.cash + 20 * 110);
});


test('limit orders enforce the regime-aware risk budget', async () => {
  const runtime = new ServerTradingRuntime({
    capital: 10000,
    risk: { capital: 10000, maxPositionPct: 1, maxOrderPct: 1, maxDailyLossPct: 1, maxDrawdownPct: 1, maxLeverage: 10 },
    riskBudgetPolicy: { maxGrossExposurePct: 0.05, maxNetExposurePct: 0.05, maxStrategyRiskPct: 0.05, regimeMultipliers: { normal: 1 }, minimumCashPct: 0 },
  });
  runtime.attachPaperOperationSession({ snapshot: () => ({ state: 'running', liveExecutionEnabled: false, sessionId: 'test', startedAt: 1, ownerApproved: true }) } as any);
  await assert.rejects(() => runtime.paperLimitOrder({ clientOrderId: 'budget-limit-1', symbol: 'BTC', side: 'buy', qty: 6, limitPrice: 100, tick: { symbol: 'BTC', venue: 'paper', market: 'crypto' as const, last: 100, bid: 99.9, ask: 100.1, bidSize: 1, askSize: 1, sequence: 1, exchangeTs: 1, receivedTs: 1 }, strategyId: 's1' }), /risk_budget_gross_exposure_exceeded|risk_budget_strategy_cap_exceeded/);
});


test('paper limit and market risk gates use last marks for cross-symbol leverage', async () => {
  const runtime = new ServerTradingRuntime({
    capital: 10000, risk: { capital: 10000, maxPositionPct: 1, maxOrderPct: 1, maxDailyLossPct: 1, maxDrawdownPct: 1, maxLeverage: 1.1 },
    riskBudgetPolicy: { maxGrossExposurePct: 1, maxNetExposurePct: 1, maxStrategyRiskPct: 1, regimeMultipliers: { normal: 1 }, minimumCashPct: 0 },
    paperOperationSession: activePaperSession('marks'),
  }, new InMemoryTradingEventJournal(), new InMemoryMarketTickRecorder(), new InMemoryTaskQueue(), new InMemoryRuntimeSnapshotStore());
  await runtime.paperOrder({ clientOrderId:'btc-open', symbol:'BTC', side:'buy', qty:1, tick:{ symbol:'BTC', venue:'paper', market:'crypto' as const, last:9000, bid:8999, ask:9001, bidSize:1, askSize:1, exchangeTs:1000, receivedTs:1000, sequence:1 } });
  await assert.rejects(() => runtime.paperOrder({ clientOrderId:'cross-mark', symbol:'ETH', side:'buy', qty:3, tick:{ symbol:'ETH', venue:'paper', market:'crypto' as const, last:1000, bid:999, ask:1000, bidSize:1, askSize:1, exchangeTs:1100, receivedTs:1100, sequence:2 } }), /leverage_limit_exceeded/);
});

test('daily PnL resets when the trading day changes', async () => {
  const runtime = new ServerTradingRuntime({ capital:10000, risk:{ capital:10000, maxPositionPct:1, maxOrderPct:0.2, maxDailyLossPct:0.01, maxDrawdownPct:1, maxLeverage:10 }, paperOperationSession: activePaperSession('day') }, new InMemoryTradingEventJournal(), new InMemoryMarketTickRecorder(), new InMemoryTaskQueue(), new InMemoryRuntimeSnapshotStore());
  const day1 = Date.parse('2026-09-15T10:00:00Z');
  const day2 = Date.parse('2026-09-16T10:00:00Z');
  const buyTick = { symbol:'BTC', venue:'paper', market:'crypto' as const, last:100, bid:99, ask:101, bidSize:100, askSize:100, exchangeTs:day1, receivedTs:day1, sequence:1 };
  const sellTick = { symbol:'BTC', venue:'paper', market:'crypto' as const, last:90, bid:89, ask:91, bidSize:100, askSize:100, exchangeTs:day1 + 1000, receivedTs:day1 + 1000, sequence:2 };
  await runtime.paperOrder({ clientOrderId:'day1-buy', symbol:'BTC', side:'buy', qty:10, tick:buyTick });
  await runtime.paperOrder({ clientOrderId:'day1-sell', symbol:'BTC', side:'sell', qty:10, tick:sellTick });
  assert.ok(runtime.snapshot().dailyPnl < 0);
  await runtime.onMarketTick({ symbol:'BTC', venue:'paper', market:'crypto', last:90, bid:89, ask:91, bidSize:100, askSize:100, exchangeTs:day2, receivedTs:day2, sequence:3 });
  assert.equal(runtime.snapshot().dailyPnl, 0);
});

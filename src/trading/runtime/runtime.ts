import { PaperPostTradeTracker, SqlStrategyPerformanceStore, buildPerformanceSnapshot, type StrategyPerformanceStore } from "../post-trade.ts";
import { InMemoryPostTradeFeedbackStore, SqlPostTradeFeedbackStore, recordPostTradeFeedback, type PostTradeFeedbackStore } from "../post-trade-feedback.ts";
import { nativeRiskCheck } from "../../runtime/tools/trading.ts";
import { buildRiskBudget, checkRiskBudgetOrder, type RiskBudgetPolicy } from "../portfolio/risk-budget.ts";
import type { MarketTick } from "../latency.ts";
import type { RiskLimits } from "../../runtime/tools/trading.ts";
import { evaluateTradingReadiness, type ReadinessContext, type ReadinessReport } from "../readiness.ts";
import { createTradingEvent, TradingEventBus } from "./event-bus.ts";
import { PaperExchange, type PaperFill, type PaperOrder } from "./paper-exchange.ts";
import { SqlMarketTickRecorder, SqlTradingEventJournal, type MarketTickRecorder, type TradingEventJournal } from "./journal.ts";
import { SqlTaskQueue, type EnqueueTaskInput, type TaskQueue, type TradingTask } from "./task-queue.ts";
import { TradingWorkerSupervisor, type WorkerExecutor, type WorkerSupervisorOptions } from "./worker-supervisor.ts";
import { SqlRuntimeSnapshotStore, type RuntimeEventCursor, type RuntimeSnapshotStore, type TradingRuntimeSnapshot } from "./snapshot.ts";
import { TradingEventWorkerRouter } from "./event-worker-router.ts";
import type { CycleHealthInput, CycleHealthResult } from "../ops/cycle-health.ts";
import type { PaperOperationSession, PaperOperationSnapshot } from "../ops/paper-operations.ts";
import { TradingWorkerActivationService, type TradingWorkerActivationOptions } from "./worker-activation.ts";

export interface RuntimeState {
  mode: "paper" | "live-disabled";
  capitalLimit: number;
  allocatedCapital: number;
  dailyPnl: number;
  killSwitch: boolean;
  eventsProcessed: number;
  lastMarketTs: number;
  peakEquity: number;
  hardDrawdownBreached: boolean;
  pnlDayKey?: string;
  pnlDayStartRealizedPnl?: number;
}

export interface RuntimeSnapshotConfig {
  /** Governed regime-aware portfolio risk budget enforced on real paper orders. */
  riskBudgetPolicy?: Omit<RiskBudgetPolicy, "equity">;
  runtimeId?: string;
  snapshotStore?: RuntimeSnapshotStore;
  performanceStore?: StrategyPerformanceStore;
  feedbackStore?: PostTradeFeedbackStore;
  snapshotIntervalMs?: number;
  paperOperationSession?: PaperOperationSession;
}

export class ServerTradingRuntime {
  readonly events = new TradingEventBus();
  readonly paper: PaperExchange;
  readonly journal: TradingEventJournal;
  readonly marketRecorder: MarketTickRecorder;
  readonly queue: TaskQueue;
  readonly workerEventRouter: TradingEventWorkerRouter;
  readonly snapshots: RuntimeSnapshotStore;
  readonly runtimeId: string;
  private state: RuntimeState;
  private readonly risk: RiskLimits;
  private readonly riskBudgetPolicy: Omit<RiskBudgetPolicy, "equity">;
  private eventCursor: RuntimeEventCursor | null = null;
  private readonly snapshotIntervalMs: number;
  private cycleHealth: CycleHealthResult | null = null;
  private cycleHealthInputs: Omit<CycleHealthInput, "cycleId"> | null = null;
  private lastSnapshotAt = 0;
  readonly postTrade = new PaperPostTradeTracker();
  readonly performanceStore: StrategyPerformanceStore;
  readonly feedbackStore: PostTradeFeedbackStore;
  private paperOperationSession: PaperOperationSession | null;

  constructor(
    config: { capital: number; risk: RiskLimits; feeBps?: number; slippageBps?: number; latencyMs?: number } & RuntimeSnapshotConfig,
    journal: TradingEventJournal = new SqlTradingEventJournal(),
    marketRecorder: MarketTickRecorder = new SqlMarketTickRecorder(),
    queue: TaskQueue = new SqlTaskQueue(),
    snapshotStore: RuntimeSnapshotStore = config.snapshotStore ?? new SqlRuntimeSnapshotStore(),
  ) {
    this.risk = config.risk;
    this.riskBudgetPolicy = config.riskBudgetPolicy ?? {
      maxGrossExposurePct: Math.min(1, Math.max(0.01, config.risk.maxPositionPct)),
      maxNetExposurePct: Math.min(1, Math.max(0.01, config.risk.maxPositionPct)),
      maxStrategyRiskPct: Math.min(1, Math.max(0.01, config.risk.maxPositionPct)),
      regimeMultipliers: { normal: 1 },
      minimumCashPct: 0,
    };
    this.paper = new PaperExchange(config.capital, config.feeBps, { baseSlippageBps: config.slippageBps, latencyMs: config.latencyMs });
    this.journal = journal;
    this.marketRecorder = marketRecorder;
    this.queue = queue;
    this.workerEventRouter = new TradingEventWorkerRouter({ events: this.events, queue: this.queue });
    this.runtimeId = config.runtimeId ?? "server-trading-runtime";
    this.snapshots = snapshotStore;
    this.performanceStore = config.performanceStore ?? new SqlStrategyPerformanceStore();
    this.feedbackStore = config.feedbackStore ?? new InMemoryPostTradeFeedbackStore();
    this.snapshotIntervalMs = Math.max(250, Math.floor(config.snapshotIntervalMs ?? 1000));
    this.paperOperationSession = config.paperOperationSession ?? null;
    const initialDayKey = new Date().toISOString().slice(0, 10);
    this.state = { mode: "paper", capitalLimit: config.capital, allocatedCapital: 0, dailyPnl: 0, killSwitch: false, eventsProcessed: 0, lastMarketTs: 0, peakEquity: config.capital, hardDrawdownBreached: false, pnlDayKey: initialDayKey, pnlDayStartRealizedPnl: 0 };
  }

  snapshot(): RuntimeState { return { ...this.state }; }
  private refreshDailyPnl(ts: number): void {
    const key = new Date(ts).toISOString().slice(0, 10);
    const realized = this.paper.snapshot().realizedPnl;
    if (!this.state.pnlDayKey) {
      this.state.pnlDayKey = key;
      this.state.pnlDayStartRealizedPnl = realized - this.state.dailyPnl;
    } else if (this.state.pnlDayKey !== key) {
      this.state.pnlDayKey = key;
      this.state.pnlDayStartRealizedPnl = realized;
      this.state.dailyPnl = 0;
      return;
    }
    const baseline = Number.isFinite(this.state.pnlDayStartRealizedPnl) ? this.state.pnlDayStartRealizedPnl! : realized;
    this.state.dailyPnl = realized - baseline;
  }

  private currentMarks(): Record<string, number> {
    const marks: Record<string, number> = {};
    for (const symbol of Object.keys(this.paper.snapshot().positions)) {
      const mark = this.paper.lastMark(symbol);
      if (mark != null) marks[symbol] = mark;
    }
    return marks;
  }


  paperOperationSnapshot(): PaperOperationSnapshot | null { return this.paperOperationSession?.snapshot() ?? null; }

  attachPaperOperationSession(session: PaperOperationSession): PaperOperationSnapshot {
    const snapshot = session.snapshot();
    if (snapshot.liveExecutionEnabled) throw new Error("paper_operation_live_execution_forbidden");
    this.paperOperationSession = session;
    return snapshot;
  }

  detachPaperOperationSession(): void { this.paperOperationSession = null; }

  private requireRunningPaperOperation(): PaperOperationSnapshot {
    if (!this.paperOperationSession) throw new Error("paper_operation_session_required");
    const snapshot = this.paperOperationSession.snapshot();
    if (snapshot.liveExecutionEnabled) throw new Error("paper_operation_live_execution_forbidden");
    if (snapshot.state !== "running") throw new Error(`paper_operation_session_not_running:${snapshot.state}`);
    return snapshot;
  }

  cycleHealthSnapshot(): CycleHealthResult | null { return this.cycleHealth ? structuredClone(this.cycleHealth) : null; }

  setCycleHealthContext(input: Omit<CycleHealthInput, "cycleId">): void { this.cycleHealthInputs = structuredClone(input); }

  cycleHealthContext(): Omit<CycleHealthInput, "cycleId"> | null { return this.cycleHealthInputs ? structuredClone(this.cycleHealthInputs) : null; }

  setCycleHealth(result: CycleHealthResult): void { this.cycleHealth = structuredClone(result); }

  readinessReport(now = Date.now()): ReadinessReport {
    const account = this.paper.snapshot();
    const paperTrades = this.postTrade.trades();
    const context: ReadinessContext = {
      mode: this.state.mode === "paper" ? "live-disabled" : "live-disabled",
      liveExecutionEnabled: false,
      risk: { limits: { ...this.risk, capital: this.state.capitalLimit }, hardVetoProbePassed: (() => { const probe = nativeRiskCheck({ side:"buy", qty:Math.max(this.state.capitalLimit, 1), price:1, position:null, limits:{...this.risk, capital:this.state.capitalLimit}, dailyPnl:this.state.dailyPnl, equity:Math.max(1, account.equity), peakEquity:this.state.peakEquity }); return !probe.ok && probe.reasons.includes("order_limit_exceeded"); })(), killSwitchClear: !this.state.killSwitch, peakEquityValid: Number.isFinite(this.state.peakEquity) && this.state.peakEquity > 0 },
      data: { latestMarketTs: this.state.lastMarketTs || 0, nowTs: now, maxFreshnessMs: 5_000, pitValidated: false, sourceCount: 0 },
      research: { latestOosPassed: false, latestWalkForwardPassed: false, validationTs: 0, maxAgeMs: 86_400_000 },
      paper: { startedTs: this.state.lastMarketTs || now, nowTs: now, tradeCount: paperTrades.length, minTradeCount: 50, snapshotHealthy: true },
      security: { sandboxSelfTestPassed: false, egressPolicyVerified: false, productionIsolationVerified: false, deploymentAttestationValid: false, connectorReadinessVerified: false, deploymentSandboxVerified: false },
      governance: { ownerCapitalApprovalActive: false, capitalBudget: this.state.capitalLimit, riskEnvelopeValid: true },
      observability: { journalHealthy: true, postTradeAttributionHealthy: true, snapshotHealthy: true },
      operationalHealth: this.cycleHealth ? { status: this.cycleHealth.status, score: this.cycleHealth.score } : undefined,
    };
    return evaluateTradingReadiness(context, now);
  }

  private buildSnapshot(now = Date.now()): TradingRuntimeSnapshot {
    return { schemaVersion: 1, runtimeId: this.runtimeId, savedAt: now, runtimeState: this.snapshot(), paper: this.paper.exportState(), eventCursor: this.eventCursor ? { ...this.eventCursor } : null, postTrade: this.postTrade.exportState() };
  }

  async persistSnapshot(now = Date.now()): Promise<boolean> {
    const saved = await this.snapshots.save(this.buildSnapshot(now));
    if (saved) this.lastSnapshotAt = now;
    return saved;
  }

  async recoverFromSnapshot(): Promise<boolean> {
    const stored = await this.snapshots.latest(this.runtimeId);
    if (!stored) return false;
    if (stored.schemaVersion !== 1) throw new Error(`unsupported_runtime_snapshot_schema:${stored.schemaVersion}`);
    this.state = structuredClone(stored.runtimeState);
    this.paper.restoreState(stored.paper);
    const recoveredEquity = this.paper.snapshot().equity;
    this.state.peakEquity = Number.isFinite(this.state.peakEquity) && this.state.peakEquity > 0
      ? Math.max(this.state.peakEquity, recoveredEquity)
      : recoveredEquity;
    this.state.hardDrawdownBreached = this.state.hardDrawdownBreached === true;
    const recoveredRealized = this.paper.snapshot().realizedPnl;
    const recoveredDayKey = new Date(stored.savedAt).toISOString().slice(0, 10);
    if (!this.state.pnlDayKey) this.state.pnlDayKey = recoveredDayKey;
    if (!Number.isFinite(this.state.pnlDayStartRealizedPnl)) {
      this.state.pnlDayStartRealizedPnl = recoveredRealized - this.state.dailyPnl;
    }
    this.refreshDailyPnl(stored.savedAt);
    this.eventCursor = stored.eventCursor ? { ...stored.eventCursor } : null;
    this.postTrade.restoreState(stored.postTrade);
    this.lastSnapshotAt = stored.savedAt;
    return true;
  }

  createWorkerActivationService(options: Omit<TradingWorkerActivationOptions, "queue" | "router"> = {}): TradingWorkerActivationService {
    return new TradingWorkerActivationService({
      events: this.events,
      options: {
        ...options,
        queue: this.queue,
        router: this.workerEventRouter,
      },
    });
  }

  async enqueueWorkerTask<T>(input: EnqueueTaskInput<T>): Promise<TradingTask<T>> {
    return (await this.queue.enqueue(input)).task;
  }

  async setCapitalLimit(amount: number): Promise<void> {
    if (!Number.isFinite(amount) || amount < 0 || amount > this.risk.capital) throw new Error("invalid capital envelope");
    this.state.capitalLimit = amount;
    await this.persistSnapshot();
  }

  async setKillSwitch(on: boolean): Promise<void> { this.state.killSwitch = on; await this.persistSnapshot(); }

  async onMarketTick(tick: MarketTick): Promise<void> {
    const event = createTradingEvent(
      "market.tick",
      "market-runtime",
      tick,
      tick.receivedTs,
      `market-runtime:market.tick:${tick.venue}:${tick.symbol}:${tick.exchangeTs}:${tick.sequence}`,
    );
    const inserted = await this.journal.append(event);
    await this.marketRecorder.record(event);
    if (!inserted) return;
    this.state.lastMarketTs = Math.max(this.state.lastMarketTs, tick.exchangeTs);
    this.eventCursor = { ts: event.ts, eventId: event.id };
    this.paper.mark(tick.symbol, tick.last);
    const marked = this.paper.snapshot();
    this.state.peakEquity = Math.max(this.state.peakEquity, marked.equity);
    const drawdownLimit = Math.max(0, Math.min(1, this.risk.maxDrawdownPct));
    if (this.state.peakEquity > 0 && (this.state.peakEquity - marked.equity) / this.state.peakEquity >= drawdownLimit - 1e-12) {
      this.state.hardDrawdownBreached = true;
    }
    this.refreshDailyPnl(tick.receivedTs);
    this.state.eventsProcessed += 1;
    await this.events.publish(event);
    const execution = this.paper.processTick({
      symbol: tick.symbol, bid: tick.bid, ask: tick.ask, bidSize: tick.bidSize, askSize: tick.askSize, ts: tick.receivedTs,
    });
    const stateChanged = execution.fills.length > 0;
    for (const fill of execution.fills) await this.recordPaperFill(fill);
    this.refreshDailyPnl(tick.receivedTs);
    if (stateChanged || tick.receivedTs - this.lastSnapshotAt >= this.snapshotIntervalMs) {
      await this.persistSnapshot(tick.receivedTs);
    }
  }

  async paperOrder(input: { clientOrderId: string; symbol: string; side: "buy" | "sell"; qty: number; tick: MarketTick; orderType?: "market" | "limit"; limitPrice?: number; latencyMs?: number; strategyId?: string; regime?: string; evidenceIds?: string[]; decisionSubjectId?: string; decisionAction?: "buy" | "sell"; decisionConfidence?: number; participantIds?: string[]; councilIds?: string[] }): Promise<PaperFill> {
    this.requireRunningPaperOperation();
    if (this.state.killSwitch) throw new Error("kill_switch_active");
    if (this.cycleHealth?.status === "halted") throw new Error("operational_cycle_health_halted");
    const price = input.side === "buy" ? input.tick.ask : input.tick.bid;
    // The order decision uses the incoming market mark, then latches any hard drawdown breach.
    this.paper.mark(input.symbol, input.tick.last);
    this.refreshDailyPnl(input.tick.receivedTs);
    const account = this.paper.snapshot();
    const drawdownLimit = Math.max(0, Math.min(1, this.risk.maxDrawdownPct));
    if (this.state.peakEquity > 0 && (this.state.peakEquity - account.equity) / this.state.peakEquity >= drawdownLimit - 1e-12) {
      this.state.hardDrawdownBreached = true;
    }
    if (this.state.hardDrawdownBreached) throw new Error("risk_veto:max_drawdown_exceeded");
    const current = account.positions[input.symbol];
    const position = current && current.qty !== 0 ? {
      symbol: input.symbol, side: current.qty > 0 ? "buy" : "sell", qty: Math.abs(current.qty), entry: current.avgPrice, mark: current.avgPrice, leverage: 1,
    } as const : null;
    const openOrders = this.paper.listOrders().filter((order) => ["open", "partially_filled"].includes(order.status));
    const pendingForSymbol = openOrders.filter((order) => order.symbol === input.symbol);
    const pendingSignedQty = pendingForSymbol.reduce((sum, order) => sum + (order.side === "buy" ? order.remainingQty : -order.remainingQty), 0);
    const projectedSymbolQty = (current?.qty ?? 0) + pendingSignedQty;
    const existingGrossExposureNotional = Object.entries(account.positions).reduce((sum, [symbol, item]) => {
      const pending = openOrders.filter((order) => order.symbol === symbol);
      const pendingQty = pending.reduce((qty, order) => qty + (order.side === "buy" ? order.remainingQty : -order.remainingQty), 0);
      const referencePrice = symbol === input.symbol ? price : (this.paper.lastMark(symbol) ?? item.avgPrice);
      return sum + Math.abs(item.qty + pendingQty) * referencePrice;
    }, 0) - Math.abs(projectedSymbolQty) * price;
    const riskBudget = buildRiskBudget({ ...this.riskBudgetPolicy, equity: Math.max(account.equity, 1) }, input.regime ?? "normal", input.strategyId ? [input.strategyId] : []);
    const budgetGate = checkRiskBudgetOrder({ allocation: riskBudget, side: input.side, qty: input.qty, price, positions: account.positions, marks: this.currentMarks(), symbol: input.symbol, strategyId: input.strategyId, currentCash: account.cash });
    const gate = nativeRiskCheck({
      side: input.side, qty: input.qty, price, position: { ...position, qty: position ? Math.abs((current?.qty ?? 0) + pendingSignedQty) : Math.abs(pendingSignedQty) } as typeof position,
      limits: { ...this.risk, capital: this.state.capitalLimit }, dailyPnl: this.state.dailyPnl, equity: account.equity,
      existingGrossExposureNotional, peakEquity: this.state.peakEquity,
    });
    if (!gate.ok || !budgetGate.ok) {
      const reasons = [...gate.reasons.map((reason) => `risk:${reason}`), ...budgetGate.reasons.map((reason) => `budget:${reason}`)];
      throw new Error(`risk_veto:${reasons.join(",")}`);
    }
    const fill = this.paper.submit({
      clientOrderId: input.clientOrderId, symbol: input.symbol, side: input.side, qty: input.qty,
      orderType: input.orderType, limitPrice: input.limitPrice, bid: input.tick.bid, ask: input.tick.ask,
      bidSize: input.tick.bidSize, askSize: input.tick.askSize, ts: input.tick.receivedTs, latencyMs: input.latencyMs,
      strategyId: input.strategyId, regime: input.regime, evidenceIds: input.evidenceIds,
      decisionSubjectId: input.decisionSubjectId, decisionAction: input.decisionAction, decisionConfidence: input.decisionConfidence, participantIds: input.participantIds, councilIds: input.councilIds,
    });
    await this.recordPaperFill(fill);
    this.refreshDailyPnl(fill.ts);
    this.state.peakEquity = Math.max(this.state.peakEquity, this.paper.snapshot().equity);
    await this.persistSnapshot(fill.ts);
    return fill;
  }

  async paperLimitOrder(input: { clientOrderId: string; symbol: string; side: "buy" | "sell"; qty: number; limitPrice: number; tick: MarketTick; latencyMs?: number; strategyId?: string; regime?: string; evidenceIds?: string[] }): Promise<PaperOrder> {
    this.requireRunningPaperOperation();
    if (this.state.killSwitch) throw new Error("kill_switch_active");
    const price = input.limitPrice;
    this.paper.mark(input.symbol, input.tick.last);
    this.refreshDailyPnl(input.tick.receivedTs);
    const account = this.paper.snapshot();
    const drawdownLimit = Math.max(0, Math.min(1, this.risk.maxDrawdownPct));
    if (this.state.peakEquity > 0 && (this.state.peakEquity - account.equity) / this.state.peakEquity >= drawdownLimit - 1e-12) {
      this.state.hardDrawdownBreached = true;
    }
    if (this.state.hardDrawdownBreached) throw new Error("risk_veto:max_drawdown_exceeded");
    const current = account.positions[input.symbol];
    const openOrders = this.paper.listOrders().filter((order) => ["open", "partially_filled"].includes(order.status));
    const pendingForSymbol = openOrders.filter((order) => order.symbol === input.symbol);
    const pendingSignedQty = pendingForSymbol.reduce((sum, order) => sum + (order.side === "buy" ? order.remainingQty : -order.remainingQty), 0);
    const projectedExistingQty = (current?.qty ?? 0) + pendingSignedQty;
    const position = projectedExistingQty !== 0 ? {
      symbol: input.symbol, side: projectedExistingQty > 0 ? "buy" : "sell", qty: Math.abs(projectedExistingQty), entry: current?.avgPrice ?? price, mark: price, leverage: 1,
    } as const : null;
    const existingGrossExposureNotional = Object.entries(account.positions).reduce((sum, [symbol, item]) => {
      const pending = openOrders.filter((order) => order.symbol === symbol);
      const pendingQty = pending.reduce((qty, order) => qty + (order.side === "buy" ? order.remainingQty : -order.remainingQty), 0);
      const referencePrice = symbol === input.symbol ? price : (this.paper.lastMark(symbol) ?? item.avgPrice);
      return sum + Math.abs(item.qty + pendingQty) * referencePrice;
    }, 0);
    const riskBudget = buildRiskBudget({ ...this.riskBudgetPolicy, equity: Math.max(account.equity, 1) }, input.regime ?? "normal", input.strategyId ? [input.strategyId] : []);
    const budgetGate = checkRiskBudgetOrder({ allocation: riskBudget, side: input.side, qty: input.qty, price, positions: account.positions, marks: this.currentMarks(), symbol: input.symbol, strategyId: input.strategyId, currentCash: account.cash });
    const gate = nativeRiskCheck({
      side: input.side, qty: input.qty, price, position,
      limits: { ...this.risk, capital: this.state.capitalLimit }, dailyPnl: this.state.dailyPnl, equity: account.equity,
      existingGrossExposureNotional, peakEquity: this.state.peakEquity,
    });
    if (!gate.ok || !budgetGate.ok) {
      const reasons = [...gate.reasons.map((reason) => `risk:${reason}`), ...budgetGate.reasons.map((reason) => `budget:${reason}`)];
      throw new Error(`risk_veto:${reasons.join(",")}`);
    }
    const order = this.paper.openOrder({ clientOrderId: input.clientOrderId, symbol: input.symbol, side: input.side, qty: input.qty, orderType: "limit", limitPrice: input.limitPrice, bid: input.tick.bid, ask: input.tick.ask, bidSize: input.tick.bidSize, askSize: input.tick.askSize, ts: input.tick.receivedTs, latencyMs: input.latencyMs, strategyId: input.strategyId, regime: input.regime, evidenceIds: input.evidenceIds });
    await this.persistSnapshot(order.updatedTs);
    return order;
  }

  async cancelPaperOrder(clientOrderId: string, ts = Date.now()): Promise<PaperOrder> {
    const order = this.paper.cancel(clientOrderId, ts);
    await this.persistSnapshot(ts);
    return order;
  }

  private async recordPaperFill(fill: PaperFill): Promise<void> {
    const event = createTradingEvent(
      "paper.order.filled", "paper-runtime", fill, fill.ts,
      `paper-runtime:paper.order.filled:${fill.fillId}`,
    );
    const inserted = await this.journal.append(event);
    if (!inserted) return;
    this.state.allocatedCapital += fill.side === "buy" ? fill.qty * fill.price : -fill.qty * fill.price;
    this.state.eventsProcessed += 1;
    this.state.dailyPnl = this.paper.snapshot().realizedPnl;
    await this.events.publish(event);
    const completed = this.postTrade.recordFill(fill);
    for (const trade of completed) {
      await recordPostTradeFeedback(this.feedbackStore, trade);
    }
    for (const strategyId of new Set(completed.map((trade) => trade.strategyId))) {
      const snapshot = await buildPerformanceSnapshot(strategyId, this.postTrade.trades(strategyId), fill.ts);
      await this.performanceStore.save(snapshot);
    }
  }
}

export function createServerWorkerSupervisor(executor: WorkerExecutor, options: WorkerSupervisorOptions = {}): TradingWorkerSupervisor {
  const runtime = getServerTradingRuntime();
  return new TradingWorkerSupervisor({ queue: runtime.queue, executor, options });
}

let singleton: ServerTradingRuntime | null = null;
export function getServerTradingRuntime(config: ConstructorParameters<typeof ServerTradingRuntime>[0] = { capital: 100_000, risk: { capital: 100_000, maxPositionPct: 0.1, maxOrderPct: 0.02, maxDailyLossPct: 0.02, maxDrawdownPct: 0.1, maxLeverage: 2 } }): ServerTradingRuntime {
  return singleton ??= new ServerTradingRuntime({ ...config, feedbackStore: config.feedbackStore ?? new SqlPostTradeFeedbackStore() });
}

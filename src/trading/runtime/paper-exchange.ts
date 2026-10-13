import type { Side } from "../../runtime/tools/trading.ts";

export type PaperOrderType = "market" | "limit";
export type PaperOrderStatus = "open" | "partially_filled" | "filled" | "cancelled" | "rejected";

export interface PaperOrderRequest {
  clientOrderId: string;
  symbol: string;
  side: Side;
  qty: number;
  orderType?: PaperOrderType;
  limitPrice?: number;
  bid: number;
  ask: number;
  bidSize?: number;
  askSize?: number;
  ts?: number;
  latencyMs?: number;
  strategyId?: string;
  regime?: string;
  evidenceIds?: string[];
  decisionSubjectId?: string;
  decisionAction?: "buy" | "sell";
  decisionConfidence?: number;
  participantIds?: string[];
  councilIds?: string[];
}

export interface PaperFill {
  clientOrderId: string;
  fillId: string;
  symbol: string;
  side: Side;
  qty: number;
  price: number;
  fee: number;
  slippageBps: number;
  benchmarkPrice: number;
  ts: number;
  strategyId?: string;
  regime?: string;
  evidenceIds?: string[];
  decisionSubjectId?: string;
  decisionAction?: "buy" | "sell";
  decisionConfidence?: number;
  participantIds?: string[];
  councilIds?: string[];
}

export interface PaperOrder {
  clientOrderId: string;
  symbol: string;
  side: Side;
  orderType: PaperOrderType;
  requestedQty: number;
  filledQty: number;
  remainingQty: number;
  limitPrice?: number;
  status: PaperOrderStatus;
  createdTs: number;
  updatedTs: number;
  rejectReason?: string;
  strategyId?: string;
  regime?: string;
  evidenceIds?: string[];
  decisionSubjectId?: string;
  decisionAction?: "buy" | "sell";
  decisionConfidence?: number;
  participantIds?: string[];
  councilIds?: string[];
}

export interface PaperPosition {
  symbol: string;
  qty: number;
  avgPrice: number;
  realizedPnl: number;
  unrealizedPnl: number;
}

export interface PaperExecutionSnapshot {
  account: PaperAccount;
  orders: PaperOrder[];
  fills: PaperFill[];
  marks?: Record<string, number>;
}

export interface PaperAccount {
  startingCash: number;
  cash: number;
  equity: number;
  realizedPnl: number;
  fees: number;
  positions: Record<string, PaperPosition>;
}

export interface PaperExecutionConfig {
  feeBps: number;
  baseSlippageBps: number;
  latencyMs: number;
  liquidityParticipation: number;
}

export interface PaperTick {
  symbol: string;
  bid: number;
  ask: number;
  bidSize?: number;
  askSize?: number;
  ts: number;
}

export class PaperExchange {
  private account: PaperAccount;
  private readonly config: PaperExecutionConfig;
  private readonly orders = new Map<string, PaperOrder>();
  private readonly fills = new Map<string, PaperFill>();
  private readonly fillsByOrder = new Map<string, PaperFill[]>();
  /** Last valid market mark per symbol; fills revalue against this mark. */
  private readonly lastMarks = new Map<string, number>();

  constructor(startingCash: number, feeBps = 5, options: Partial<PaperExecutionConfig> = {}) {
    if (!Number.isFinite(startingCash) || startingCash <= 0) throw new Error("startingCash must be positive");
    this.config = {
      feeBps: Math.max(0, feeBps),
      baseSlippageBps: Math.max(0, options.baseSlippageBps ?? 2),
      latencyMs: Math.max(0, options.latencyMs ?? 0),
      liquidityParticipation: Math.min(1, Math.max(0.01, options.liquidityParticipation ?? 1)),
    };
    this.account = { startingCash, cash: startingCash, equity: startingCash, realizedPnl: 0, fees: 0, positions: {} };
  }

  snapshot(): PaperAccount { return structuredClone(this.account); }

  exportState(): PaperExecutionSnapshot {
    return {
      account: structuredClone(this.account),
      orders: [...this.orders.values()].map((order) => structuredClone(order)),
      fills: [...this.fills.values()].map((fill) => structuredClone(fill)),
      marks: Object.fromEntries(this.lastMarks.entries()),
    };
  }

  restoreState(snapshot: PaperExecutionSnapshot): void {
    this.account = structuredClone(snapshot.account);
    this.orders.clear();
    this.fills.clear();
    this.fillsByOrder.clear();
    this.lastMarks.clear();
    for (const order of snapshot.orders) this.orders.set(order.clientOrderId, structuredClone(order));
    for (const [symbol, position] of Object.entries(snapshot.account.positions)) {
      if (Number.isFinite(position.avgPrice) && position.avgPrice > 0 && position.unrealizedPnl !== 0) {
        const mark = position.qty !== 0 ? position.avgPrice + position.unrealizedPnl / position.qty : position.avgPrice;
        if (Number.isFinite(mark) && mark > 0) this.lastMarks.set(symbol, mark);
      }
    }
    for (const fill of snapshot.fills) {
      this.fills.set(fill.fillId, structuredClone(fill));
      const list = this.fillsByOrder.get(fill.clientOrderId) ?? [];
      list.push(structuredClone(fill));
      this.fillsByOrder.set(fill.clientOrderId, list);
    }
  }

  lastMark(symbol: string): number | undefined {
    const mark = this.lastMarks.get(symbol);
    return mark != null && Number.isFinite(mark) && mark > 0 ? mark : undefined;
  }

  getOrder(clientOrderId: string): PaperOrder | undefined {
    const order = this.orders.get(clientOrderId);
    return order ? structuredClone(order) : undefined;
  }

  listOrders(): PaperOrder[] {
    return [...this.orders.values()].map((order) => structuredClone(order));
  }

  listFills(clientOrderId?: string): PaperFill[] {
    if (clientOrderId) return structuredClone(this.fillsByOrder.get(clientOrderId) ?? []);
    return [...this.fills.values()].map((fill) => structuredClone(fill));
  }

  mark(symbol: string, price: number): void {
    const p = this.account.positions[symbol];
    if (!Number.isFinite(price) || price <= 0) return;
    this.lastMarks.set(symbol, price);
    if (!p) return;
    p.unrealizedPnl = p.qty * (price - p.avgPrice);
    this.revalue();
  }

  submit(request: PaperOrderRequest): PaperFill {
    const existingFills = this.fillsByOrder.get(request.clientOrderId);
    if (existingFills?.length) return structuredClone(existingFills[0]);
    const order = this.openOrder(request);
    if (order.status === "rejected") throw new Error(`paper_order_rejected:${order.rejectReason ?? "unknown"}`);
    const result = this.processTick({
      symbol: request.symbol,
      bid: request.bid,
      ask: request.ask,
      bidSize: request.bidSize,
      askSize: request.askSize,
      ts: (request.ts ?? Date.now()) + (request.latencyMs ?? this.config.latencyMs),
    }, request.clientOrderId);
    if (!result.fills.length) {
      // openOrder() above always stores an order for this clientOrderId
      // before we ever reach processTick with it (rejected orders throw
      // earlier), so this should be unreachable — fail closed instead of
      // risking a silent `undefined.status` crash if that invariant ever
      // breaks.
      if (!result.order) throw new Error("paper_order_missing_after_submit");
      throw new Error(result.order.status === "open" ? "paper_order_open" : `paper_order_${result.order.status}`);
    }
    return result.fills[0];
  }

  openOrder(request: PaperOrderRequest): PaperOrder {
    const existing = this.orders.get(request.clientOrderId);
    if (existing) return structuredClone(existing);
    const createdTs = request.ts ?? Date.now();
    if (!Number.isFinite(request.qty) || request.qty <= 0) return this.reject(request, createdTs, "invalid_quantity");
    if (!Number.isFinite(request.bid) || !Number.isFinite(request.ask) || request.bid <= 0 || request.ask < request.bid) {
      return this.reject(request, createdTs, "invalid_quote");
    }
    if ((request.orderType ?? "market") === "limit" && (!Number.isFinite(request.limitPrice) || request.limitPrice! <= 0)) {
      return this.reject(request, createdTs, "invalid_limit_price");
    }
    const order: PaperOrder = {
      clientOrderId: request.clientOrderId,
      symbol: request.symbol,
      side: request.side,
      orderType: request.orderType ?? "market",
      requestedQty: request.qty,
      filledQty: 0,
      remainingQty: request.qty,
      limitPrice: request.limitPrice,
      status: "open",
      createdTs,
      updatedTs: createdTs,
      strategyId: request.strategyId,
      regime: request.regime,
      evidenceIds: request.evidenceIds ? [...request.evidenceIds] : undefined,
      decisionSubjectId: request.decisionSubjectId,
      decisionAction: request.decisionAction,
      decisionConfidence: request.decisionConfidence,
      participantIds: request.participantIds ? [...request.participantIds] : undefined,
      councilIds: request.councilIds ? [...request.councilIds] : undefined,
    };
    this.orders.set(order.clientOrderId, order);
    return structuredClone(order);
  }

  cancel(clientOrderId: string, ts = Date.now()): PaperOrder {
    const order = this.orders.get(clientOrderId);
    if (!order) throw new Error("paper_order_not_found");
    if (order.status === "filled" || order.status === "cancelled" || order.status === "rejected") return structuredClone(order);
    order.status = "cancelled";
    order.updatedTs = ts;
    return structuredClone(order);
  }

  processTick(tick: PaperTick, clientOrderId?: string): { order?: PaperOrder; fills: PaperFill[] } {
    const candidates = clientOrderId ? [this.orders.get(clientOrderId)] : [...this.orders.values()];
    const fills: PaperFill[] = [];
    for (const order of candidates) {
      if (!order || order.symbol !== tick.symbol || !["open", "partially_filled"].includes(order.status)) continue;
      const touch = order.side === "buy" ? tick.ask : tick.bid;
      const executable = order.orderType === "market"
        ? true
        : order.side === "buy" ? touch <= order.limitPrice! : touch >= order.limitPrice!;
      if (!executable) continue;
      const available = order.side === "buy" ? tick.askSize : tick.bidSize;
      const participation = this.config.liquidityParticipation;
      const maxFill = available === undefined || !Number.isFinite(available) || available <= 0
        ? order.remainingQty
        : Math.min(order.remainingQty, available * participation);
      if (maxFill <= 0) continue;
      const fillQty = Math.max(0, Math.min(order.remainingQty, maxFill));
      const mid = (tick.bid + tick.ask) / 2 || touch;
      const spreadHalfBps = mid > 0 ? Math.abs(touch - mid) / mid * 10_000 : 0;
      const totalSlipBps = spreadHalfBps + this.config.baseSlippageBps;
      const direction = order.side === "buy" ? 1 : -1;
      const fillPrice = touch * (1 + direction * totalSlipBps / 10_000);
      const fee = fillQty * fillPrice * (this.config.feeBps / 10_000);
      const fill: PaperFill = {
        clientOrderId: order.clientOrderId,
        fillId: `${order.clientOrderId}:fill:${order.filledQty + fillQty}`,
        symbol: order.symbol,
        side: order.side,
        qty: fillQty,
        price: fillPrice,
        fee,
        slippageBps: totalSlipBps,
        benchmarkPrice: touch,
        ts: tick.ts,
        strategyId: order.strategyId,
        regime: order.regime,
        evidenceIds: order.evidenceIds ? [...order.evidenceIds] : undefined,
        decisionSubjectId: order.decisionSubjectId,
        decisionAction: order.decisionAction,
        decisionConfidence: order.decisionConfidence,
        participantIds: order.participantIds ? [...order.participantIds] : undefined,
        councilIds: order.councilIds ? [...order.councilIds] : undefined,
      };
      this.applyFill(fill);
      order.filledQty += fillQty;
      order.remainingQty = Math.max(0, order.requestedQty - order.filledQty);
      order.status = order.remainingQty === 0 ? "filled" : "partially_filled";
      order.updatedTs = tick.ts;
      this.fills.set(fill.fillId, fill);
      const list = this.fillsByOrder.get(order.clientOrderId) ?? [];
      list.push(fill);
      this.fillsByOrder.set(order.clientOrderId, list);
      fills.push(structuredClone(fill));
    }
    const order = clientOrderId ? this.orders.get(clientOrderId) : undefined;
    if (clientOrderId && !order) throw new Error("paper_order_not_found");
    return { order: order ? structuredClone(order) : undefined, fills };
  }

  private reject(request: PaperOrderRequest, ts: number, reason: string): PaperOrder {
    const order: PaperOrder = {
      clientOrderId: request.clientOrderId, symbol: request.symbol, side: request.side,
      orderType: request.orderType ?? "market", requestedQty: Math.max(0, request.qty || 0), filledQty: 0,
      remainingQty: Math.max(0, request.qty || 0), limitPrice: request.limitPrice,
      status: "rejected", createdTs: ts, updatedTs: ts, rejectReason: reason,
    };
    this.orders.set(order.clientOrderId, order);
    return structuredClone(order);
  }

  private applyFill(fill: PaperFill): void {
    const signedQty = fill.side === "buy" ? fill.qty : -fill.qty;
    const previous = this.account.positions[fill.symbol] ?? { symbol: fill.symbol, qty: 0, avgPrice: fill.price, realizedPnl: 0, unrealizedPnl: 0 };
    const oldQty = previous.qty;
    const nextQty = oldQty + signedQty;
    if (oldQty !== 0 && Math.sign(oldQty) !== Math.sign(signedQty)) {
      const closingQty = Math.min(Math.abs(oldQty), Math.abs(signedQty));
      const pnlPerUnit = oldQty > 0 ? fill.price - previous.avgPrice : previous.avgPrice - fill.price;
      const realized = closingQty * pnlPerUnit;
      this.account.realizedPnl += realized;
      previous.realizedPnl += realized;
    }
    if (nextQty === 0) {
      previous.qty = 0;
      previous.unrealizedPnl = 0;
    } else if (oldQty === 0 || Math.sign(oldQty) === Math.sign(signedQty)) {
      const oldAbs = Math.abs(oldQty);
      previous.avgPrice = (oldAbs * previous.avgPrice + Math.abs(signedQty) * fill.price) / (oldAbs + Math.abs(signedQty));
      previous.qty = nextQty;
    } else {
      previous.qty = nextQty;
      if (Math.sign(nextQty) !== Math.sign(oldQty)) previous.avgPrice = fill.price;
    }
    const mark = this.lastMarks.get(fill.symbol);
    if (previous.qty === 0) {
      previous.unrealizedPnl = 0;
      this.lastMarks.delete(fill.symbol);
    } else if (mark !== undefined) {
      previous.unrealizedPnl = previous.qty * (mark - previous.avgPrice);
    } else {
      // No market mark exists yet. Do not invent one; keep the position
      // conservatively at zero unrealized PnL until the first valid mark.
      previous.unrealizedPnl = 0;
    }
    this.account.positions[fill.symbol] = previous;
    this.account.cash -= signedQty * fill.price + fill.fee;
    this.account.fees += fill.fee;
    this.revalue();
  }

  private revalue(): void {
    let unrealized = 0;
    let inventory = 0;
    for (const p of Object.values(this.account.positions)) {
      unrealized += p.unrealizedPnl;
      inventory += p.qty * p.avgPrice;
    }
    this.account.equity = this.account.cash + unrealized + inventory;
  }
}

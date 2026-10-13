import ccxt from "ccxt";
import type {
  BrokerAccount,
  BrokerConnector,
  BrokerMarket,
  BrokerOrder,
  BrokerOrderRequest,
  BrokerOrderStatus,
  BrokerPosition,
} from "./broker-connectors";

// Fees/slippage default to a realistic taker-ish estimate. Callers can
// tighten or loosen these per venue if they have better data — this is a
// simulation, so the assumption is always explicit, never hidden.
const DEFAULT_FEE_BPS = 10;

type Ledger = {
  cash: number;
  positions: Map<string, { qty: number; avgEntryPrice: number }>;
  orders: Map<string, BrokerOrder>;
  sequence: number;
};

/**
 * Paper-trading connector for any CCXT exchange. Real market prices, fully
 * simulated fills and balances — this never calls an authenticated/trading
 * endpoint on the real exchange, so it needs no API secret and can never
 * place a real order. Pair with venue-adapter.ts's governance the same way
 * AlpacaPaperConnector is: createVenueAdapterRecord(..., mode: "paper").
 */
export class CcxtPaperConnector implements BrokerConnector {
  readonly id: string;
  readonly mode = "paper" as const;
  private readonly exchange: InstanceType<typeof ccxt.Exchange>;
  private readonly feeBps: number;
  private readonly ledger: Ledger = { cash: 100_000, positions: new Map(), orders: new Map(), sequence: 0 };

  constructor(exchangeId: string, opts?: { startingCash?: number; feeBps?: number }) {
    if (!ccxt.exchanges.includes(exchangeId)) {
      throw new Error(`Unknown CCXT exchange "${exchangeId}". See ccxt.exchanges for the supported list.`);
    }
    this.id = `ccxt-paper-${exchangeId}`;
    const Ctor = (ccxt as unknown as Record<string, new (config: Record<string, unknown>) => InstanceType<typeof ccxt.Exchange>>)[
      exchangeId
    ];
    this.exchange = new Ctor({ enableRateLimit: true, timeout: 10_000 });
    if (opts?.startingCash) this.ledger.cash = opts.startingCash;
    this.feeBps = opts?.feeBps ?? DEFAULT_FEE_BPS;
  }

  async account(): Promise<BrokerAccount> {
    const equity = await this.equity();
    return {
      id: this.id,
      currency: "USD",
      status: "ACTIVE",
      buyingPower: this.ledger.cash,
      cash: this.ledger.cash,
      portfolioValue: equity,
      equity,
    };
  }

  async markets(query: { assetClass?: BrokerMarket["assetClass"]; tradableOnly?: boolean; symbols?: string[] } = {}): Promise<BrokerMarket[]> {
    const loaded = await this.exchange.loadMarkets();
    const rows = Object.values(loaded) as Array<{ symbol: string; active?: boolean; type?: string }>;
    return rows
      .filter((m) => !query.symbols || query.symbols.includes(m.symbol))
      .filter((m) => !query.tradableOnly || m.active !== false)
      .map((m) => ({ symbol: m.symbol, assetClass: "crypto" as const, tradable: m.active !== false }));
  }

  async positions(): Promise<BrokerPosition[]> {
    return [...this.ledger.positions.entries()].map(([symbol, p]) => ({
      symbol,
      qty: p.qty,
      avgEntryPrice: p.avgEntryPrice,
      side: p.qty >= 0 ? ("long" as const) : ("short" as const),
    }));
  }

  async orders(options: { status?: string; limit?: number; symbol?: string } = {}): Promise<BrokerOrder[]> {
    let list = [...this.ledger.orders.values()];
    if (options.symbol) list = list.filter((o) => o.symbol === options.symbol);
    if (options.status) list = list.filter((o) => o.status === options.status);
    return list.slice(0, options.limit ?? 100);
  }

  async placeOrder(order: BrokerOrderRequest): Promise<BrokerOrder> {
    const ticker = await this.exchange.fetchTicker(order.symbol);
    const touch = order.side === "buy" ? ticker.ask : ticker.bid;
    if (!touch) throw new Error(`No live ${order.side === "buy" ? "ask" : "bid"} for ${order.symbol}`);

    const type = order.type ?? "market";
    const crosses = type === "market" || (order.side === "buy" ? (order.limitPrice ?? Infinity) >= touch : (order.limitPrice ?? 0) <= touch);
    const fillPrice = type === "limit" && order.limitPrice !== undefined ? order.limitPrice : touch;
    const qty = order.qty ?? (order.notional ? order.notional / fillPrice : 0);
    if (qty <= 0) throw new Error("Order qty/notional must resolve to a positive quantity");

    this.ledger.sequence += 1;
    const id = `${this.id}-${this.ledger.sequence}`;
    const status: BrokerOrderStatus = crosses ? "filled" : "new";

    if (crosses) this.applyFill(order.symbol, order.side, qty, fillPrice);

    const record: BrokerOrder = {
      id,
      clientOrderId: order.clientOrderId,
      symbol: order.symbol,
      side: order.side,
      type,
      qty,
      filledQty: crosses ? qty : 0,
      averageFillPrice: crosses ? fillPrice : undefined,
      status,
      submittedAt: Date.now(),
      raw: { simulated: true, venue: this.id, feeBps: this.feeBps },
    };
    this.ledger.orders.set(id, record);
    return record;
  }

  async cancelOrder(orderId: string): Promise<void> {
    const existing = this.ledger.orders.get(orderId);
    if (existing && existing.status === "new") this.ledger.orders.set(orderId, { ...existing, status: "canceled" });
  }

  private applyFill(symbol: string, side: "buy" | "sell", qty: number, price: number) {
    const notional = price * qty;
    const fee = (notional * this.feeBps) / 10_000;
    this.ledger.cash += side === "buy" ? -notional - fee : notional - fee;

    const signedQty = side === "buy" ? qty : -qty;
    const current = this.ledger.positions.get(symbol) ?? { qty: 0, avgEntryPrice: price };
    const newQty = current.qty + signedQty;
    const sameDirectionOrFlat = current.qty === 0 || Math.sign(current.qty) === Math.sign(signedQty);
    const newAvg =
      newQty === 0
        ? price
        : sameDirectionOrFlat
          ? (current.avgEntryPrice * current.qty + price * signedQty) / newQty
          : Math.sign(newQty) === Math.sign(current.qty)
            ? current.avgEntryPrice
            : price; // flipped through zero to the opposite side — the new leg's own entry price
    this.ledger.positions.set(symbol, { qty: newQty, avgEntryPrice: newAvg });
  }

  private async equity(): Promise<number> {
    let unrealized = 0;
    for (const [symbol, p] of this.ledger.positions) {
      if (p.qty === 0) continue;
      try {
        const ticker = await this.exchange.fetchTicker(symbol);
        const mark = ticker.last ?? p.avgEntryPrice;
        unrealized += (mark - p.avgEntryPrice) * p.qty;
      } catch {
        // Illiquid/delisted symbol mid-simulation — mark flat rather than fail the whole equity read.
      }
    }
    return this.ledger.cash + unrealized;
  }
}

export function supportedPaperExchanges(): string[] {
  return [...ccxt.exchanges];
}

export type BrokerSide = "buy" | "sell";
export type BrokerOrderType = "market" | "limit";
export type BrokerOrderStatus = "new" | "accepted" | "partially_filled" | "filled" | "canceled" | "rejected" | "unknown";

export interface BrokerMarket {
  symbol: string;
  name?: string;
  assetClass: "us_equity" | "crypto" | "fx" | "unknown";
  tradable: boolean;
  fractionable?: boolean;
  status?: string;
}

export interface BrokerAccount {
  id: string;
  currency: string;
  status: string;
  buyingPower: number;
  cash: number;
  portfolioValue: number;
  equity: number;
}

export interface BrokerPosition {
  symbol: string;
  qty: number;
  avgEntryPrice: number;
  marketValue?: number;
  unrealizedPnl?: number;
  side?: "long" | "short";
}

export interface BrokerOrderRequest {
  clientOrderId: string;
  symbol: string;
  side: BrokerSide;
  qty?: number;
  notional?: number;
  type?: BrokerOrderType;
  limitPrice?: number;
  timeInForce?: string;
  reduceOnly?: boolean;
}

export interface BrokerOrder {
  id: string;
  clientOrderId: string;
  symbol: string;
  side: BrokerSide;
  type: BrokerOrderType;
  qty: number;
  filledQty: number;
  averageFillPrice?: number;
  status: BrokerOrderStatus;
  submittedAt?: number;
  raw?: unknown;
}

export interface BrokerConnector {
  readonly id: string;
  readonly mode: "paper" | "live";
  account(): Promise<BrokerAccount>;
  markets(query?: { assetClass?: BrokerMarket["assetClass"]; tradableOnly?: boolean; symbols?: string[] }): Promise<BrokerMarket[]>;
  positions(): Promise<BrokerPosition[]>;
  orders(options?: { status?: string; limit?: number; symbol?: string }): Promise<BrokerOrder[]>;
  placeOrder(order: BrokerOrderRequest): Promise<BrokerOrder>;
  cancelOrder(orderId: string): Promise<void>;
}

function env(name: string): string | undefined {
  return typeof process === "undefined" ? undefined : process.env[name]?.trim() || undefined;
}

function requireEnv(name: string): string {
  const value = env(name);
  if (!value) throw new Error(`missing_${name.toLowerCase()}`);
  return value;
}

function number(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

async function jsonResponse(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  let body: unknown = {};
  try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text.slice(0, 2_000) }; }
  if (!response.ok) {
    const detail = typeof body === "object" && body ? JSON.stringify(body).slice(0, 2_000) : String(body);
    throw new Error(`broker_http_${response.status}:${detail}`);
  }
  return (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
}

function mapAlpacaOrder(raw: Record<string, unknown>): BrokerOrder {
  const status = String(raw.status ?? "unknown").toLowerCase();
  const mapped: BrokerOrderStatus = status === "new" ? "new"
    : status === "accepted" || status === "pending_new" ? "accepted"
    : status === "partially_filled" ? "partially_filled"
    : status === "filled" ? "filled"
    : status === "canceled" || status === "expired" ? "canceled"
    : status === "rejected" ? "rejected" : "unknown";
  return {
    id: String(raw.id ?? ""),
    clientOrderId: String(raw.client_order_id ?? ""),
    symbol: String(raw.symbol ?? ""),
    side: String(raw.side ?? "buy") === "sell" ? "sell" : "buy",
    type: String(raw.type ?? "market") === "limit" ? "limit" : "market",
    qty: number(raw.qty),
    filledQty: number(raw.filled_qty),
    averageFillPrice: raw.filled_avg_price == null ? undefined : number(raw.filled_avg_price),
    status: mapped,
    submittedAt: raw.submitted_at ? Date.parse(String(raw.submitted_at)) : undefined,
    raw,
  };
}

/**
 * Alpaca paper connector. Paper-only by construction: its base URL is fixed
 * to the official paper trading endpoint and it refuses any live endpoint.
 * It supports both equities and crypto through the same orders API.
 */
export class AlpacaPaperConnector implements BrokerConnector {
  readonly id = "alpaca-paper" as const;
  readonly mode = "paper" as const;
  private readonly tradingBase = "https://paper-api.alpaca.markets/v2";
  private readonly dataBase = "https://data.alpaca.markets/v2";
  private readonly key: string;
  private readonly secret: string;

  constructor(input: { key?: string; secret?: string; fetcher?: typeof fetch } = {}) {
    this.key = input.key ?? requireEnv("APCA_API_KEY_ID");
    this.secret = input.secret ?? requireEnv("APCA_API_SECRET_KEY");
    this.fetcher = input.fetcher ?? fetch;
  }

  private readonly fetcher: typeof fetch;

  private headers(): HeadersInit {
    return {
      "APCA-API-KEY-ID": this.key,
      "APCA-API-SECRET-KEY": this.secret,
      "content-type": "application/json",
      accept: "application/json",
    };
  }

  private async get(path: string): Promise<Record<string, unknown>> {
    const response = await this.fetcher(`${this.tradingBase}${path}`, { headers: this.headers() });
    return jsonResponse(response);
  }

  async account(): Promise<BrokerAccount> {
    const raw = await this.get("/account");
    return {
      id: String(raw.id ?? ""),
      currency: String(raw.currency ?? "USD"),
      status: String(raw.status ?? "unknown"),
      buyingPower: number(raw.buying_power),
      cash: number(raw.cash),
      portfolioValue: number(raw.portfolio_value),
      equity: number(raw.equity),
    };
  }

  async markets(query: { assetClass?: BrokerMarket["assetClass"]; tradableOnly?: boolean; symbols?: string[] } = {}): Promise<BrokerMarket[]> {
    const params = new URLSearchParams();
    if (query.assetClass) params.set("asset_class", query.assetClass === "us_equity" ? "us_equity" : query.assetClass === "crypto" ? "crypto" : query.assetClass);
    if (query.tradableOnly !== false) params.set("status", "active");
    if (query.symbols?.length) params.set("symbols", query.symbols.join(","));
    const response = await this.fetcher(`${this.tradingBase}/assets?${params.toString()}`, { headers: this.headers() });
    const body = await response.json() as unknown;
    if (!response.ok) throw new Error(`broker_http_${response.status}`);
    if (!Array.isArray(body)) return [];
    return body.map((raw) => {
      const row = raw as Record<string, unknown>;
      const cls = String(row.class ?? "unknown");
      return {
        symbol: String(row.symbol ?? ""),
        name: row.name == null ? undefined : String(row.name),
        assetClass: cls === "us_equity" ? "us_equity" : cls === "crypto" ? "crypto" : "unknown",
        tradable: Boolean(row.tradable),
        fractionable: row.fractionable == null ? undefined : Boolean(row.fractionable),
        status: row.status == null ? undefined : String(row.status),
      } satisfies BrokerMarket;
    }).filter((market) => !query.symbols?.length || query.symbols.includes(market.symbol));
  }

  async positions(): Promise<BrokerPosition[]> {
    const response = await this.fetcher(`${this.tradingBase}/positions`, { headers: this.headers() });
    const body = await response.json() as unknown;
    if (!response.ok) throw new Error(`broker_http_${response.status}`);
    if (!Array.isArray(body)) return [];
    return body.map((raw) => {
      const row = raw as Record<string, unknown>;
      const side = String(row.side ?? "long");
      return {
        symbol: String(row.symbol ?? ""),
        qty: number(row.qty),
        avgEntryPrice: number(row.avg_entry_price),
        marketValue: number(row.market_value),
        unrealizedPnl: number(row.unrealized_pl),
        side: side === "short" ? "short" : "long",
      } satisfies BrokerPosition;
    });
  }

  async orders(options: { status?: string; limit?: number; symbol?: string } = {}): Promise<BrokerOrder[]> {
    const params = new URLSearchParams();
    params.set("status", options.status ?? "open");
    params.set("limit", String(Math.min(500, Math.max(1, options.limit ?? 100))));
    if (options.symbol) params.set("symbols", options.symbol);
    const body = await this.get(`/orders?${params.toString()}`);
    const rows = Array.isArray(body) ? body : [];
    return rows.map((row) => mapAlpacaOrder(row as Record<string, unknown>));
  }

  async placeOrder(order: BrokerOrderRequest): Promise<BrokerOrder> {
    if (!order.clientOrderId.trim()) throw new Error("client_order_id_required");
    if (!order.symbol.trim()) throw new Error("symbol_required");
    if (order.qty == null && order.notional == null) throw new Error("qty_or_notional_required");
    if (order.qty != null && (!(order.qty > 0) || !Number.isFinite(order.qty))) throw new Error("invalid_qty");
    if (order.notional != null && (!(order.notional > 0) || !Number.isFinite(order.notional))) throw new Error("invalid_notional");
    if ((order.type ?? "market") === "limit" && (!(order.limitPrice! > 0) || !Number.isFinite(order.limitPrice))) throw new Error("limit_price_required");
    const body: Record<string, unknown> = {
      symbol: order.symbol,
      side: order.side,
      type: order.type ?? "market",
      time_in_force: order.timeInForce ?? "day",
      client_order_id: order.clientOrderId,
      ...(order.qty != null ? { qty: String(order.qty) } : {}),
      ...(order.notional != null ? { notional: String(order.notional) } : {}),
      ...(order.limitPrice != null ? { limit_price: String(order.limitPrice) } : {}),
      ...(order.reduceOnly != null ? { reduce_only: order.reduceOnly } : {}),
    };
    const response = await this.fetcher(`${this.tradingBase}/orders`, { method: "POST", headers: this.headers(), body: JSON.stringify(body) });
    return mapAlpacaOrder(await jsonResponse(response));
  }

  async cancelOrder(orderId: string): Promise<void> {
    if (!orderId.trim()) throw new Error("order_id_required");
    const response = await this.fetcher(`${this.tradingBase}/orders/${encodeURIComponent(orderId)}`, { method: "DELETE", headers: this.headers() });
    if (!response.ok) throw new Error(`broker_http_${response.status}`);
  }
}

/** Returns true when credentials for the paper broker are configured. */
export function alpacaPaperConfigured(): boolean {
  return Boolean(env("APCA_API_KEY_ID") && env("APCA_API_SECRET_KEY"));
}

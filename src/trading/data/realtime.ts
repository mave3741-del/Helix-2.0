import type { MarketTick } from "../latency.ts";

export interface RealtimeWebSocket {
  onopen: (() => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onclose: ((event?: unknown) => void) | null;
  send(data: string): void;
  close(): void;
}

export type WebSocketFactory = (url: string) => RealtimeWebSocket;

function defaultWebSocketFactory(url: string): RealtimeWebSocket {
  // Read via an untyped record rather than intersecting with `typeof
  // globalThis` directly: the DOM lib's global `WebSocket` declaration
  // (with its `(this: WebSocket, ev: Event) => any` handler signatures)
  // would otherwise merge into the intersection and make the result
  // structurally incompatible with the narrower `RealtimeWebSocket` shape
  // this module actually needs.
  const WS = (globalThis as Record<string, unknown>).WebSocket as
    | (new (url: string) => RealtimeWebSocket)
    | undefined;
  if (!WS) throw new Error("websocket_unavailable: provide a WebSocketFactory in this runtime");
  return new WS(url);
}

function asJson(data: unknown): unknown {
  if (typeof data === "string") return JSON.parse(data);
  if (data instanceof ArrayBuffer) return JSON.parse(new TextDecoder().decode(data));
  if (ArrayBuffer.isView(data)) return JSON.parse(new TextDecoder().decode(data.buffer));
  throw new Error("unsupported_websocket_message");
}

function finite(value: unknown, fallback = 0): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function positive(value: unknown): number | null {
  const n = finite(value, NaN);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function now(): number { return Date.now(); }

abstract class ReconnectingAdapter {
  protected socket: RealtimeWebSocket | null = null;
  protected stopped = true;
  protected reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  protected attempt = 0;
  protected onTick: ((tick: MarketTick) => void | Promise<void>) | null = null;

  protected readonly wsFactory: WebSocketFactory;

  constructor(wsFactory: WebSocketFactory = defaultWebSocketFactory) {
    this.wsFactory = wsFactory;
  }

  protected abstract open(): RealtimeWebSocket;
  protected abstract handleMessage(data: unknown): Promise<void>;
  protected connected(_socket: RealtimeWebSocket): void {}

  async connect(onTick: (tick: MarketTick) => void | Promise<void>): Promise<void> {
    this.onTick = onTick;
    this.stopped = false;
    this.attempt = 0;
    this.connectNow();
  }

  protected connectNow(): void {
    if (this.stopped) return;
    this.socket?.close();
    const socket = this.open();
    this.socket = socket;
    socket.onopen = () => { this.attempt = 0; this.connected(socket); };
    socket.onmessage = (event) => {
      void this.handleMessage(asJson(event.data)).catch(() => this.scheduleReconnect());
    };
    socket.onerror = () => this.scheduleReconnect();
    socket.onclose = () => this.scheduleReconnect();
  }

  protected scheduleReconnect(): void {
    if (this.stopped || this.reconnectTimer) return;
    const delay = Math.min(30_000, 250 * 2 ** Math.min(this.attempt, 7));
    this.attempt += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connectNow();
    }, delay);
  }

  protected async emit(tick: MarketTick): Promise<void> {
    if (this.onTick) await this.onTick(tick);
  }

  async disconnect(): Promise<void> {
    this.stopped = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.socket?.close();
    this.socket = null;
    this.onTick = null;
  }
}

export interface BinanceBookTickerAdapterOptions {
  symbol: string;
  market?: "crypto" | "futures";
  endpoint?: string;
  wsFactory?: WebSocketFactory;
}

/**
 * Binance best-bid/offer adapter. It combines bookTicker with aggTrade so the tick
 * carries both microstructure and last-trade information. Binance documents raw and
 * combined streams and lowercase stream names; the reconnect loop also tolerates the
 * venue's scheduled disconnects.
 */
export class BinanceBookTickerAdapter extends ReconnectingAdapter {
  readonly id: string;
  readonly venue: string;
  private readonly symbol: string;
  private readonly market: "crypto" | "futures";
  private readonly endpoint: string;
  private sequence = 0;
  private bid = 0;
  private ask = 0;
  private bidSize = 0;
  private askSize = 0;
  private last = 0;

  constructor(options: BinanceBookTickerAdapterOptions) {
    super(options.wsFactory);
    this.symbol = options.symbol.toLowerCase();
    this.market = options.market ?? "crypto";
    this.venue = this.market === "futures" ? "binance-futures" : "binance-spot";
    this.endpoint = options.endpoint ?? (this.market === "futures" ? "wss://fstream.binance.com/stream" : "wss://stream.binance.com:9443/stream");
    this.id = `${this.venue}.${this.symbol}.bookTicker`;
  }

  protected open(): RealtimeWebSocket {
    const streams = `${this.symbol}@bookTicker/${this.symbol}@aggTrade`;
    const socket = this.wsFactory(`${this.endpoint}?streams=${streams}`);
    return socket;
  }

  protected async handleMessage(message: unknown): Promise<void> {
    const root = message as { data?: Record<string, unknown> };
    const data = (root.data ?? root) as Record<string, unknown>;
    const event = String(data.e ?? "");
    if (event === "bookTicker") {
      this.bid = finite(data.b, 0);
      this.ask = finite(data.a, 0);
      this.bidSize = finite(data.B, 0);
      this.askSize = finite(data.A, 0);
    } else if (event === "aggTrade") {
      this.last = finite(data.p, this.last);
    } else {
      return;
    }

    if (this.bid <= 0 || this.ask <= 0 || this.ask < this.bid) return;
    if (this.last <= 0) this.last = (this.bid + this.ask) / 2;
    this.sequence += 1;
    const eventTs = finite(data.E, 0) || finite(data.T, 0);
    const exchangeTs = eventTs > 0 ? eventTs : now();
    await this.emit({
      symbol: this.symbol.toUpperCase(), venue: this.venue, market: this.market,
      bid: this.bid, ask: this.ask, last: this.last, bidSize: this.bidSize, askSize: this.askSize,
      sequence: this.sequence, exchangeTs, receivedTs: now(),
    });
  }
}

export interface AlpacaQuoteAdapterOptions {
  symbol: string;
  asset: "equity" | "crypto";
  endpoint?: string;
  key: string;
  secret: string;
  wsFactory?: WebSocketFactory;
  feed?: string;
}

export class AlpacaQuoteAdapter extends ReconnectingAdapter {
  readonly id: string;
  readonly venue = "alpaca";
  private readonly symbol: string;
  private readonly asset: "equity" | "crypto";
  private readonly endpoint: string;
  private readonly key: string;
  private readonly secret: string;
  private readonly feed: string;
  private sequence = 0;

  constructor(options: AlpacaQuoteAdapterOptions) {
    super(options.wsFactory);
    this.symbol = options.symbol;
    this.asset = options.asset;
    this.key = options.key;
    this.secret = options.secret;
    this.feed = options.feed ?? (options.asset === "equity" ? "iex" : "us");
    this.endpoint = options.endpoint ?? (options.asset === "equity"
      ? `wss://stream.data.alpaca.markets/v2/${this.feed}`
      : `wss://stream.data.alpaca.markets/v1beta3/crypto/${this.feed}`);
    this.id = `alpaca.${this.asset}.${this.symbol}`;
  }

  protected open(): RealtimeWebSocket {
    return this.wsFactory(this.endpoint);
  }

  protected connected(socket: RealtimeWebSocket): void {
    socket.send(JSON.stringify({ action: "auth", key: this.key, secret: this.secret }));
    socket.send(JSON.stringify({ action: "subscribe", quotes: [this.symbol] }));
  }

  protected async handleMessage(message: unknown): Promise<void> {
    if (!Array.isArray(message)) return;
    for (const item of message as Array<Record<string, unknown>>) {
      if (String(item.T ?? "") !== "q") continue;
      const bid = positive(item.bp);
      const ask = positive(item.ap);
      if (bid === null || ask === null || ask < bid) continue;
      const mid = (bid + ask) / 2;
      const ts = Date.parse(String(item.t ?? ""));
      this.sequence += 1;
      await this.emit({
        symbol: this.symbol,
        venue: this.venue,
        market: this.asset,
        bid, ask, last: mid,
        bidSize: finite(item.bs), askSize: finite(item.as),
        sequence: this.sequence,
        exchangeTs: Number.isFinite(ts) ? ts : now(),
        receivedTs: now(),
      });
    }
  }
}

import type { MarketTick } from "@/trading/latency";

export interface MarketDataAdapter {
  readonly id: string;
  readonly venue: string;
  connect(onTick: (tick: MarketTick) => void | Promise<void>): Promise<void>;
  disconnect(): Promise<void>;
}

export interface AdapterConfig { apiKey?: string; secret?: string; endpoint?: string; }

function isPrivateOrLocalHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/[[\]]/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host === "0.0.0.0" || host === "::1") return true;
  if (/^127\.(?:\d{1,3}\.){2}\d{1,3}$/.test(host)) return true;
  if (/^10\.(?:\d{1,3}\.){2}\d{1,3}$/.test(host)) return true;
  if (/^192\.168\.(?:\d{1,3}\.)\d{1,3}$/.test(host)) return true;
  const m = host.match(/^172\.(\d{1,3})\.(?:\d{1,3})\.(?:\d{1,3})$/);
  if (m && Number(m[1]) >= 16 && Number(m[1]) <= 31) return true;
  if (/^169\.254\.(?:\d{1,3}\.)\d{1,3}$/.test(host)) return true;
  if (host.endsWith(".local") || host.endsWith(".internal") || host.endsWith(".lan")) return true;
  return false;
}

export function assertPublicHttpEndpoint(endpoint: string): string {
  const url = new URL(endpoint);
  if (!/^https?:$/.test(url.protocol)) throw new Error("adapter endpoint must use http(s)");
  if (url.username || url.password) throw new Error("adapter endpoint must not embed credentials");
  if (isPrivateOrLocalHost(url.hostname)) throw new Error("adapter endpoint must not target private or local destinations");
  return url.toString();
}

export class ReplayMarketAdapter implements MarketDataAdapter {
  readonly id: string;
  readonly venue: string;
  private stopped = false;
  private readonly ticks: MarketTick[];
  private readonly delayMs: number;
  constructor(id: string, venue: string, ticks: MarketTick[], delayMs = 0) { this.id = id; this.venue = venue; this.ticks = ticks; this.delayMs = delayMs; }
  async connect(onTick: (tick: MarketTick) => void | Promise<void>): Promise<void> {
    this.stopped = false;
    for (const tick of [...this.ticks].sort((a, b) => a.exchangeTs - b.exchangeTs)) {
      if (this.stopped) break;
      if (this.delayMs > 0) await new Promise((r) => setTimeout(r, this.delayMs));
      await onTick(tick);
    }
  }
  async disconnect(): Promise<void> { this.stopped = true; }
}

export class WebSocketMarketAdapter implements MarketDataAdapter {
  readonly id: string;
  readonly venue: string;
  readonly endpoint: string;
  constructor(venue: string, endpoint: string) { this.venue = venue; this.endpoint = endpoint; this.id = `${venue}.websocket`; assertPublicHttpEndpoint(endpoint.replace(/^http/, "ws")); }
  async connect(_onTick: (tick: MarketTick) => void | Promise<void>): Promise<void> { throw new Error("websocket transport adapter requires a venue-specific implementation"); }
  async disconnect(): Promise<void> {}
}

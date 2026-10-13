import type { MarketDataAdapter } from "./adapters.ts";

export interface DataSourceDescriptor {
  id: string;
  assetClasses: Array<"crypto" | "equity" | "fx" | "futures" | "options" | "commodities">;
  realtime: boolean;
  historical: boolean;
  pointInTimeSafe: boolean;
  latencyClass: "tick" | "sub-second" | "seconds" | "batch";
  notes: string;
}

export const MARKET_DATA_SOURCE_REGISTRY: DataSourceDescriptor[] = [
  { id: "venue-native-websocket", assetClasses: ["crypto", "equity", "fx", "futures", "options", "commodities"], realtime: true, historical: false, pointInTimeSafe: true, latencyClass: "tick", notes: "Preferred fast path; requires venue-specific implementation and terms review." },
  { id: "venue-native-rest", assetClasses: ["crypto", "equity", "fx", "futures", "options", "commodities"], realtime: false, historical: true, pointInTimeSafe: true, latencyClass: "seconds", notes: "Reference/snapshot and order endpoints; subject to venue rate limits." },
  { id: "historical-replay", assetClasses: ["crypto", "equity", "fx", "futures", "options", "commodities"], realtime: false, historical: true, pointInTimeSafe: true, latencyClass: "batch", notes: "Deterministic replay adapter used for research and regression." },
  { id: "public-json-http", assetClasses: ["crypto", "equity", "fx", "futures", "options", "commodities"], realtime: false, historical: true, pointInTimeSafe: false, latencyClass: "seconds", notes: "Allowlisted public JSON source adapter; publication/availability timestamps and source-specific provenance must be supplied by the caller." },
  { id: "fred.series.observations", assetClasses: ["equity", "fx", "futures", "commodities"], realtime: false, historical: true, pointInTimeSafe: true, latencyClass: "batch", notes: "FRED/ALFRED observations with explicit real-time windows and vintage-aware normalization." },
  { id: "sec.edgar.submissions", assetClasses: ["equity"], realtime: false, historical: true, pointInTimeSafe: true, latencyClass: "seconds", notes: "SEC EDGAR company filing history with acceptance-time availability and declared User-Agent." },
  { id: "alphavantage.news.sentiment", assetClasses: ["crypto", "equity", "fx"], realtime: true, historical: true, pointInTimeSafe: true, latencyClass: "seconds", notes: "News/sentiment adapter normalized by publication timestamp; API/provider terms and licensing must be configured before production ingestion." },
  { id: "smart-money.onchain", assetClasses: ["crypto"], realtime: false, historical: true, pointInTimeSafe: true, latencyClass: "seconds", notes: "Normalized public on-chain transfer observations with entity confidence and strict as-of rejection." },
  { id: "smart-money.sec.13f", assetClasses: ["equity"], realtime: false, historical: true, pointInTimeSafe: true, latencyClass: "batch", notes: "Normalized institutional holdings using filing acceptance time as availability boundary." },
  { id: "smart-money.cftc.cot", assetClasses: ["futures", "commodities", "fx"], realtime: false, historical: true, pointInTimeSafe: true, latencyClass: "batch", notes: "Normalized aggregate positioning; report publication/availability timestamps remain authoritative." },
  { id: "alpaca.market-data.historical-bars", assetClasses: ["crypto", "equity"], realtime: false, historical: true, pointInTimeSafe: true, latencyClass: "seconds", notes: "Read-only historical stock/crypto bars with pagination, feed/adjustment controls, and bar-end PIT availability." },
];

export class AdapterRegistry {
  private readonly adapters = new Map<string, MarketDataAdapter>();
  register(adapter: MarketDataAdapter): void { this.adapters.set(adapter.id, adapter); }
  get(id: string): MarketDataAdapter | undefined { return this.adapters.get(id); }
  list(): MarketDataAdapter[] { return [...this.adapters.values()]; }
}

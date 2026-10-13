// CCXT market-data bridge. Public ticker/OHLCV endpoints need no API key on
// almost every exchange, so this works immediately with zero setup.
//
// Deliberately read-only: no createOrder/cancelOrder here. HELIX's execution
// path is paper-only by design (see trading/execution/venue-adapter.ts —
// live_execution_is_globally_disabled is a hard, server-side kill switch).
// If crypto paper-trading via an exchange testnet is wanted later, that's a
// separate, explicit addition — this module only ever reads public prices.
import ccxt from "ccxt";

// Every exchange CCXT supports is fair game for market data and paper
// trading: unlike live execution, reading a public price feed (or
// simulating a paper fill against one) carries no real-fund risk no matter
// which of the ~100+ venues it comes from, so this isn't hand-curated the
// way a live-trading allowlist would need to be.
const ALLOWED_EXCHANGES = new Set<string>(ccxt.exchanges);

const exchangeCache = new Map<string, InstanceType<typeof ccxt.Exchange>>();

function getExchange(exchangeId: string) {
  if (!ALLOWED_EXCHANGES.has(exchangeId)) {
    throw new Error(`Exchange "${exchangeId}" isn't on the allowlist (${[...ALLOWED_EXCHANGES].join(", ")})`);
  }
  const cached = exchangeCache.get(exchangeId);
  if (cached) return cached;
  const Ctor = (ccxt as unknown as Record<string, new (config: Record<string, unknown>) => InstanceType<typeof ccxt.Exchange>>)[exchangeId];
  if (!Ctor) throw new Error(`Unknown exchange "${exchangeId}"`);
  const instance = new Ctor({ enableRateLimit: true, timeout: 10_000 });
  exchangeCache.set(exchangeId, instance);
  return instance;
}

export type TickerSnapshot = {
  exchange: string;
  symbol: string;
  last: number | undefined;
  bid: number | undefined;
  ask: number | undefined;
  changePercent24h: number | undefined;
  quoteVolume24h: number | undefined;
  timestamp: number | undefined;
};

export async function fetchTicker(exchangeId: string, symbol: string): Promise<TickerSnapshot> {
  const exchange = getExchange(exchangeId);
  const ticker = await exchange.fetchTicker(symbol);
  return {
    exchange: exchangeId,
    symbol,
    last: ticker.last,
    bid: ticker.bid,
    ask: ticker.ask,
    changePercent24h: ticker.percentage,
    quoteVolume24h: ticker.quoteVolume,
    timestamp: ticker.timestamp,
  };
}

export type CandleSnapshot = { time: number; open: number; high: number; low: number; close: number; volume: number };

export async function fetchCandles(exchangeId: string, symbol: string, timeframe = "1h", limit = 100): Promise<CandleSnapshot[]> {
  const exchange = getExchange(exchangeId);
  const capped = Math.min(Math.max(limit, 1), 500);
  if (!exchange.has?.fetchOHLCV) throw new Error(`${exchangeId} doesn't support OHLCV candles via CCXT`);
  const rows = await exchange.fetchOHLCV(symbol, timeframe, undefined, capped);
  return rows.map(([time, open, high, low, close, volume]) => ({
    time: time ?? 0,
    open: open ?? 0,
    high: high ?? 0,
    low: low ?? 0,
    close: close ?? 0,
    volume: volume ?? 0,
  }));
}

export function supportedExchanges(): string[] {
  return [...ALLOWED_EXCHANGES];
}

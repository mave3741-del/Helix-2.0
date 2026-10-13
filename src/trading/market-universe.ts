import type { MarketVenue } from "./latency.ts";

export interface MarketUniverseEntry {
  symbol: string;
  venue: string;
  market: MarketVenue;
  active: boolean;
  source: string;
  effectiveFrom: number;
  metadata?: Record<string, string | number | boolean | null>;
}

export interface MarketUniverseSnapshot {
  universeId: string;
  version: string;
  asOfTs: number;
  entries: MarketUniverseEntry[];
}

export interface MarketUniverseProvider {
  getUniverse(asOfTs: number): Promise<MarketUniverseSnapshot>;
}

export function normalizeMarketUniverse(input: MarketUniverseSnapshot, maxSize = 1_000): MarketUniverseSnapshot {
  if (!input.universeId.trim() || !input.version.trim()) throw new Error("market_universe_identity_required");
  if (!Number.isFinite(input.asOfTs)) throw new Error("market_universe_as_of_required");
  const seen = new Set<string>();
  const entries = [...input.entries]
    .filter((e) => e.active && e.symbol.trim() && e.venue.trim() && Number.isFinite(e.effectiveFrom) && e.effectiveFrom <= input.asOfTs)
    .map((e) => ({ ...e, symbol: e.symbol.trim().toUpperCase(), venue: e.venue.trim() }))
    .sort((a, b) => `${a.venue}:${a.symbol}`.localeCompare(`${b.venue}:${b.symbol}`))
    .filter((e) => {
      const key = `${e.venue}:${e.symbol}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, Math.max(1, Math.min(1_000, Math.floor(maxSize))));
  return { ...input, entries };
}

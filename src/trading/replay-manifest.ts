import type { MarketTick } from "./latency.ts";
import type { MarketTickRangeQuery, MarketTickRecorder, RecordedMarketTick } from "./runtime/journal.ts";
import { stableHash } from "./runtime/task-results.ts";

export interface ReplayManifestQuery extends MarketTickRangeQuery {
  market?: MarketTick["market"];
}

export interface ReplayManifest {
  schemaVersion: 1;
  manifestId: string;
  source: "trading_market_ticks";
  symbol: string;
  venue: string | null;
  market: MarketTick["market"] | null;
  fromExchangeTs: number;
  toExchangeTs: number;
  tickCount: number;
  firstSequence: number | null;
  lastSequence: number | null;
  dataHash: string;
  manifestHash: string;
}

export interface ReplayManifestBuild {
  manifest: ReplayManifest;
  records: RecordedMarketTick[];
}

function canonicalRecords(records: RecordedMarketTick[]) {
  return records.map(({ eventId, tick }) => ({
    eventId,
    tick: {
      symbol: tick.symbol,
      venue: tick.venue,
      market: tick.market,
      bid: tick.bid,
      ask: tick.ask,
      last: tick.last,
      bidSize: tick.bidSize,
      askSize: tick.askSize,
      sequence: tick.sequence,
      exchangeTs: tick.exchangeTs,
      receivedTs: tick.receivedTs,
    },
  }));
}

function validateRecords(records: RecordedMarketTick[]): void {
  let previous: { exchangeTs: number; sequence: number; eventId: string } | null = null;
  const seen = new Set<string>();
  for (const record of records) {
    const tick = record.tick;
    const logicalKey = `${tick.symbol}|${tick.venue}|${tick.exchangeTs}|${tick.sequence}`;
    if (seen.has(logicalKey)) throw new Error(`duplicate_market_tick:${logicalKey}`);
    seen.add(logicalKey);
    if (previous) {
      const outOfOrder = tick.exchangeTs < previous.exchangeTs
        || (tick.exchangeTs === previous.exchangeTs && tick.sequence < previous.sequence)
        || (tick.exchangeTs === previous.exchangeTs && tick.sequence === previous.sequence && record.eventId < previous.eventId);
      if (outOfOrder) throw new Error("market_tick_order_violation");
    }
    previous = { exchangeTs: tick.exchangeTs, sequence: tick.sequence, eventId: record.eventId };
  }
}

export async function buildReplayManifest(
  recorder: MarketTickRecorder,
  query: ReplayManifestQuery,
): Promise<ReplayManifestBuild> {
  const records = await recorder.listRange(query);
  validateRecords(records);
  const canonical = canonicalRecords(records);
  const dataHash = await stableHash(canonical);
  const first = records[0]?.tick ?? null;
  const last = records.at(-1)?.tick ?? null;
  const symbol = query.symbol ?? first?.symbol ?? "*";
  const venue = query.venue ?? first?.venue ?? null;
  const market = query.market ?? first?.market ?? null;
  const fromExchangeTs = query.fromTs ?? first?.exchangeTs ?? 0;
  const toExchangeTs = query.toTs ?? last?.exchangeTs ?? fromExchangeTs;
  const identity = {
    schemaVersion: 1 as const,
    source: "trading_market_ticks" as const,
    symbol, venue, market, fromExchangeTs, toExchangeTs,
    tickCount: records.length,
    firstSequence: first?.sequence ?? null,
    lastSequence: last?.sequence ?? null,
    dataHash,
  };
  const manifestHash = await stableHash(identity);
  const manifestId = `replay:${symbol}:${venue ?? "*"}:${fromExchangeTs}:${toExchangeTs}:${manifestHash.slice(0, 16)}`;
  return { manifest: { ...identity, manifestId, manifestHash }, records };
}

export async function verifyReplayManifest(manifest: ReplayManifest, records: RecordedMarketTick[]): Promise<boolean> {
  validateRecords(records);
  if (records.length !== manifest.tickCount) return false;
  const canonical = canonicalRecords(records);
  const dataHash = await stableHash(canonical);
  if (dataHash !== manifest.dataHash) return false;
  const identity = {
    schemaVersion: manifest.schemaVersion, source: manifest.source, symbol: manifest.symbol,
    venue: manifest.venue, market: manifest.market, fromExchangeTs: manifest.fromExchangeTs,
    toExchangeTs: manifest.toExchangeTs, tickCount: manifest.tickCount,
    firstSequence: manifest.firstSequence, lastSequence: manifest.lastSequence, dataHash: manifest.dataHash,
  };
  return (await stableHash(identity)) === manifest.manifestHash;
}

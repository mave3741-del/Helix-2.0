import type { MarketTick } from "./latency";
import type { MarketSnapshot } from "./market-scanner";

export class RealtimeMarketSnapshotBook {
  private readonly ticks = new Map<string, MarketTick>();
  update(tick: MarketTick): void { this.ticks.set(`${tick.venue}:${tick.symbol}`, { ...tick }); }
  snapshots(now = Date.now()): MarketSnapshot[] {
    return [...this.ticks.values()].map(t => ({symbol:t.symbol,venue:t.venue,market:t.market,last:t.last,bid:t.bid,ask:t.ask,timestamp:t.receivedTs || now,liquidityScore: t.bidSize > 0 && t.askSize > 0 ? Math.min(1,(t.bidSize+t.askSize)/(Math.max(t.last,1)*100)) : undefined}));
  }
}

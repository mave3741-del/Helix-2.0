export type DataSourceState = 'healthy' | 'degraded' | 'halted';

export interface DataSourceHealth {
  sourceId: string;
  healthy: boolean;
  observedAt: number;
  latencyMs: number;
  quality: number;
  errorRate: number;
  markets: string[];
}

export interface DataHealthPolicy {
  maxAgeMs: number;
  maxLatencyMs: number;
  minQuality: number;
  maxErrorRate: number;
  minHealthySources: number;
}

export interface MarketDataHealthResult {
  state: DataSourceState;
  healthySources: string[];
  degradedSources: string[];
  haltedSources: string[];
  reasons: string[];
  quorumReadyMarkets: string[];
}

export function evaluateMarketDataHealth(
  sources: DataSourceHealth[],
  now: number,
  policy: DataHealthPolicy,
): MarketDataHealthResult {
  const healthySources: string[] = [];
  const degradedSources: string[] = [];
  const haltedSources: string[] = [];
  const reasons: string[] = [];
  for (const source of sources) {
    const stale = now - source.observedAt > policy.maxAgeMs || source.observedAt > now;
    const hardFailure = !source.healthy || stale || source.latencyMs > policy.maxLatencyMs * 3 || source.errorRate >= 0.9 || source.quality <= 0;
    const degraded = source.latencyMs > policy.maxLatencyMs || source.errorRate > policy.maxErrorRate || source.quality < policy.minQuality;
    if (hardFailure) {
      haltedSources.push(source.sourceId);
    } else if (degraded) {
      degradedSources.push(source.sourceId);
    } else {
      healthySources.push(source.sourceId);
    }
  }
  if (healthySources.length < policy.minHealthySources) reasons.push('data_source_quorum_unavailable');
  const marketCounts = new Map<string, number>();
  for (const source of sources.filter((source) => healthySources.includes(source.sourceId))) {
    for (const market of source.markets) marketCounts.set(market, (marketCounts.get(market) ?? 0) + 1);
  }
  const quorumReadyMarkets = [...marketCounts.entries()].filter(([, count]) => count >= policy.minHealthySources).map(([market]) => market).sort();
  if (!quorumReadyMarkets.length) reasons.push('no_market_has_healthy_source_quorum');
  if (haltedSources.length) reasons.push('source_hard_failure');
  const state: DataSourceState = reasons.length ? (healthySources.length ? 'degraded' : 'halted') : degradedSources.length ? 'degraded' : 'healthy';
  return { state, healthySources: healthySources.sort(), degradedSources: degradedSources.sort(), haltedSources: haltedSources.sort(), reasons: [...new Set(reasons)].sort(), quorumReadyMarkets };
}

export function assertMarketDataReady(result: MarketDataHealthResult): void {
  if (result.state === 'halted' || result.quorumReadyMarkets.length === 0) throw new Error(`market_data_not_ready:${result.reasons.join(',')}`);
}

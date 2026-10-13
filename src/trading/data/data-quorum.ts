export interface QuorumObservation {
  sourceId: string;
  providerId?: string;
  market: string;
  asOf: number;
  value: number;
  quality: number;
  contentHash?: string;
}

export interface QuorumResult {
  market: string;
  asOf: number;
  value: number;
  confidence: number;
  acceptedSources: string[];
  rejectedSources: Array<{ sourceId: string; reason: string }>;
  disagreementBps: number;
}

export interface DataQuorumPolicy {
  minSources: number;
  maxAgeMs: number;
  minQuality: number;
  maxDisagreementBps: number;
}

function median(values: number[]): number {
  const xs = [...values].sort((a, b) => a - b);
  const mid = Math.floor(xs.length / 2);
  return xs.length % 2 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2;
}

function bps(a: number, b: number): number {
  return Math.abs(a - b) / Math.max(Math.abs(b), 1e-9) * 10_000;
}

export function resolveQuorum(
  observations: QuorumObservation[],
  now: number,
  policy: DataQuorumPolicy,
): QuorumResult {
  if (!observations.length) throw new Error("quorum_no_observations");
  const sourceIds = observations.map((x) => x.sourceId.trim());
  if (sourceIds.some((id) => !id)) throw new Error("quorum_source_id_required");
  if (new Set(sourceIds).size !== sourceIds.length) throw new Error("quorum_duplicate_source_id");
  const providerIds = observations.map((x) => (x.providerId ?? x.sourceId).trim());
  if (providerIds.some((id) => !id)) throw new Error("quorum_provider_id_required");
  if (new Set(providerIds).size !== providerIds.length) throw new Error("quorum_duplicate_provider_id");
  const market = observations[0].market;
  if (observations.some((x) => x.market !== market)) throw new Error("quorum_market_mismatch");
  const rejectedSources: QuorumResult["rejectedSources"] = [];
  const eligible = observations.filter((x) => {
    if (!(x.quality >= policy.minQuality)) { rejectedSources.push({ sourceId: x.sourceId, reason: "quality_below_threshold" }); return false; }
    if (now - x.asOf > policy.maxAgeMs) { rejectedSources.push({ sourceId: x.sourceId, reason: "stale_observation" }); return false; }
    if (x.asOf > now) { rejectedSources.push({ sourceId: x.sourceId, reason: "future_observation" }); return false; }
    if (!Number.isFinite(x.value)) { rejectedSources.push({ sourceId: x.sourceId, reason: "invalid_value" }); return false; }
    return true;
  });
  if (eligible.length < policy.minSources) throw new Error("quorum_insufficient_sources");
  const value = median(eligible.map((x) => x.value));
  const disagreementBps = Math.max(...eligible.map((x) => bps(x.value, value)));
  if (disagreementBps > policy.maxDisagreementBps) throw new Error("quorum_disagreement_exceeded");
  const quality = eligible.reduce((s, x) => s + x.quality, 0) / eligible.length;
  const confidence = Math.max(0, Math.min(1, quality * (1 - disagreementBps / Math.max(policy.maxDisagreementBps, 1))));
  return {
    market,
    asOf: Math.max(...eligible.map((x) => x.asOf)),
    value,
    confidence,
    acceptedSources: eligible.map((x) => x.sourceId).sort(),
    rejectedSources,
    disagreementBps,
  };
}

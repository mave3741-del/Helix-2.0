export interface EvidenceQualityDimensions {
  sourceTier: number;
  pointInTime: number;
  provenance: number;
  freshness: number;
  completeness: number;
}

export interface EvidenceQuality {
  score: number;
  dimensions: EvidenceQualityDimensions;
  reasons: string[];
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function scoreEvidenceQuality(input: {
  sourceTier?: number;
  eventTs: number;
  publishedTs?: number | null;
  availableTs?: number | null;
  retrievedTs: number;
  asOfTs?: number;
  provenance?: Record<string, unknown>;
  requiredProvenance?: string[];
  maxFreshnessMs?: number;
  pointInTimeValid?: boolean;
}): EvidenceQuality {
  const reasons: string[] = [];
  const sourceTier = clamp(input.sourceTier ?? 0.75);
  const pointInTime = input.pointInTimeValid === false ? 0 : 1;
  const provenanceKeys = input.requiredProvenance ?? ["source"];
  const provenance = provenanceKeys.length === 0
    ? 1
    : provenanceKeys.filter((key) => input.provenance?.[key] != null && String(input.provenance[key]).trim() !== "").length / provenanceKeys.length;

  if (pointInTime < 1) reasons.push("point_in_time_invalid");
  if (provenance < 1) reasons.push("provenance_incomplete");
  if (sourceTier < 0.75) reasons.push("source_tier_below_preferred");

  const asOfTs = input.asOfTs ?? input.retrievedTs;
  const freshnessBase = input.availableTs ?? input.publishedTs ?? input.eventTs;
  const ageMs = Math.max(0, asOfTs - freshnessBase);
  const maxFreshnessMs = Math.max(1, input.maxFreshnessMs ?? 86_400_000);
  const freshness = clamp(1 - ageMs / maxFreshnessMs);
  if (freshness < 0.5) reasons.push("evidence_stale_at_asof");

  const completenessFields = [input.eventTs, input.retrievedTs, input.availableTs ?? input.publishedTs ?? null];
  const completeness = completenessFields.filter((value) => value != null && Number.isFinite(value)).length / completenessFields.length;
  if (completeness < 1) reasons.push("temporal_metadata_incomplete");

  const score = Number((
    sourceTier * 0.30
    + pointInTime * 0.25
    + provenance * 0.15
    + freshness * 0.15
    + completeness * 0.15
  ).toFixed(6));

  return {
    score,
    dimensions: { sourceTier, pointInTime, provenance, freshness, completeness },
    reasons,
  };
}

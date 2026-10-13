export interface TimedObservation {
  eventTs: number;
  publishedTs: number;
  availableTs: number;
}

export interface PointInTimeResult {
  ok: boolean;
  reasons: string[];
  lagMs: number;
}

export function validatePointInTime(obs: TimedObservation, asOfTs: number): PointInTimeResult {
  const reasons: string[] = [];
  if (![obs.eventTs, obs.publishedTs, obs.availableTs, asOfTs].every(Number.isFinite)) reasons.push("invalid_timestamp");
  if (obs.publishedTs < obs.eventTs) reasons.push("published_before_event");
  if (obs.availableTs < obs.publishedTs) reasons.push("available_before_published");
  if (obs.availableTs > asOfTs) reasons.push("not_available_at_asof");
  return { ok: reasons.length === 0, reasons, lagMs: Math.max(0, obs.availableTs - obs.eventTs) };
}

export function filterAvailable<T extends TimedObservation>(observations: T[], asOfTs: number): T[] {
  return observations.filter((x) => validatePointInTime(x, asOfTs).ok);
}

import type { Bar } from "@/runtime/tools/trading";

export interface DataQualityReport {
  ok: boolean;
  rows: number;
  duplicateTimestamps: number;
  missingPositivePrices: number;
  invalidOHLC: number;
  nonMonotonicTimestamps: number;
  volumeAnomalies: number;
  score: number;
  reasons: string[];
}

export function checkBarData(bars: Bar[]): DataQualityReport {
  const reasons: string[] = [];
  const seen = new Set<number>();
  let duplicateTimestamps = 0;
  let missingPositivePrices = 0;
  let invalidOHLC = 0;
  let nonMonotonicTimestamps = 0;
  let volumeAnomalies = 0;
  let previousTs = -Infinity;

  for (const b of bars) {
    if (seen.has(b.ts)) duplicateTimestamps += 1;
    seen.add(b.ts);
    if (b.ts < previousTs) nonMonotonicTimestamps += 1;
    previousTs = b.ts;
    if (![b.open, b.high, b.low, b.close].every((x) => Number.isFinite(x) && x > 0)) missingPositivePrices += 1;
    if (!(b.high >= Math.max(b.open, b.close) && b.low <= Math.min(b.open, b.close) && b.high >= b.low)) invalidOHLC += 1;
    if (!Number.isFinite(b.volume) || b.volume < 0) volumeAnomalies += 1;
  }

  if (!bars.length) reasons.push("empty_dataset");
  if (duplicateTimestamps) reasons.push("duplicate_timestamps");
  if (missingPositivePrices) reasons.push("invalid_prices");
  if (invalidOHLC) reasons.push("invalid_ohlc");
  if (nonMonotonicTimestamps) reasons.push("non_monotonic_timestamps");
  if (volumeAnomalies) reasons.push("invalid_volume");

  const defects = duplicateTimestamps + missingPositivePrices + invalidOHLC + nonMonotonicTimestamps + volumeAnomalies;
  const score = bars.length ? Math.max(0, 1 - defects / (bars.length * 2)) : 0;
  return { ok: reasons.length === 0, rows: bars.length, duplicateTimestamps, missingPositivePrices, invalidOHLC, nonMonotonicTimestamps, volumeAnomalies, score, reasons };
}

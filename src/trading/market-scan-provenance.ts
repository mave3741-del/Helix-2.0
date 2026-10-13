import type { MarketScanResult } from "./market-scanner.ts";

export interface MarketScanRecord extends MarketScanResult {
  recordedAt: number;
}

export interface MarketScanProvenanceStore {
  append(record: MarketScanRecord): Promise<void>;
  get(scanId: string): Promise<MarketScanRecord | null>;
  list(limit?: number): Promise<MarketScanRecord[]>;
}

export class InMemoryMarketScanProvenanceStore implements MarketScanProvenanceStore {
  private readonly records = new Map<string, MarketScanRecord>();
  async append(record: MarketScanRecord): Promise<void> {
    if (this.records.has(record.scanId)) return;
    this.records.set(record.scanId, structuredClone(record));
  }
  async get(scanId: string): Promise<MarketScanRecord | null> {
    const record = this.records.get(scanId);
    return record ? structuredClone(record) : null;
  }
  async list(limit = 100): Promise<MarketScanRecord[]> {
    return [...this.records.values()].sort((a, b) => b.completedAt - a.completedAt || b.scanId.localeCompare(a.scanId)).slice(0, Math.max(1, Math.min(1_000, limit))).map((record) => structuredClone(record));
  }
}

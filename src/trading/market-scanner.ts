import type { MarketVenue } from "./latency.ts";
import type { TaskQueue } from "./runtime/task-queue.ts";
import type { MarketUniverseProvider } from "./market-universe.ts";
import type { MarketScanProvenanceStore } from "./market-scan-provenance.ts";

export type MarketScanCadence = "normal" | "high-volatility";

export interface MarketSnapshot {
  symbol: string;
  venue: string;
  market: MarketVenue;
  last: number;
  bid: number;
  ask: number;
  volume24h?: number;
  return1h?: number;
  return24h?: number;
  volatility?: number;
  relativeStrength?: number;
  unusualVolume?: number;
  liquidityScore?: number;
  spreadBps?: number;
  sector?: string;
  timestamp: number;
}

export interface MarketScanCandidate {
  symbol: string;
  venue: string;
  market: MarketVenue;
  score: number;
  reasons: string[];
  snapshotTs: number;
  sector?: string;
}

export interface MarketScanProvenance {
  source?: string;
  sourceRequestTs: number;
  sourceCompletedTs: number;
  sourceAttempts: number;
  sourceSymbols: string[];
}

export interface MarketScanRejectionSummary {
  missing_identity: number;
  invalid_price: number;
  invalid_quote: number;
  stale: number;
  excessive_spread: number;
  illiquid: number;
}

export interface MarketScanResult {
  scanId: string;
  cadence: MarketScanCadence;
  startedAt: number;
  completedAt: number;
  universeSize: number;
  validMarkets: number;
  rejectedMarkets: number;
  candidates: MarketScanCandidate[];
  universeId?: string;
  universeVersion?: string;
  universeAsOfTs?: number;
  provenance?: MarketScanProvenance;
  rejectionReasons?: MarketScanRejectionSummary;
  scoreVersion: string;
  policyVersion: string;
}

export interface MarketScannerOptions {
  normalIntervalMs?: number;
  highVolatilityIntervalMs?: number;
  maxUniverseSize?: number;
  candidateLimit?: number;
  minLiquidityScore?: number;
  maxSpreadBps?: number;
  staleAfterMs?: number;
  sourceMaxAttempts?: number;
  sourceTimeoutMs?: number;
  candidateCooldownMs?: number;
  portfolioMaxSinglePct?: number;
  portfolioMaxThemePct?: number;
  provenanceStore?: MarketScanProvenanceStore;
}

export interface MarketScannerStatus {
  running: boolean;
  highVolatility: boolean;
  cadenceMs: number;
  scansStarted: number;
  scansCompleted: number;
  scansFailed: number;
  lastScanCompletedAt: number | null;
  lastScanId: string | null;
}

export interface MarketScanner {
  scan(markets: MarketSnapshot[], now?: number): MarketScanResult;
  scanFromUniverse(provider: MarketUniverseProvider, source: (symbols: string[]) => Promise<MarketSnapshot[]>, now?: number): Promise<MarketScanResult>;
  enqueueCandidates(result: MarketScanResult, queue: TaskQueue, now?: number): Promise<number>;
  start(source: () => Promise<MarketSnapshot[]>, onScan?: (result: MarketScanResult) => Promise<void> | void): void;
  stop(): void;
  getStatus(): MarketScannerStatus;
}

const DEFAULTS = {
  normalIntervalMs: 10 * 60_000,
  highVolatilityIntervalMs: 5 * 60_000,
  maxUniverseSize: 1_000,
  candidateLimit: 100,
  minLiquidityScore: 0.35,
  maxSpreadBps: 50,
  staleAfterMs: 90_000,
  sourceMaxAttempts: 3,
  sourceTimeoutMs: 30_000,
  candidateCooldownMs: 10 * 60_000,
  portfolioMaxSinglePct: 0.25,
  portfolioMaxThemePct: 0.50,
};

const SCORE_VERSION = "market-score-v2";
const POLICY_VERSION = "market-scan-policy-v2";

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function finiteOrZero(value: number | undefined): number {
  return Number.isFinite(value) ? Number(value) : 0;
}

function stableScanId(now: number, markets: MarketSnapshot[]): string {
  const key = markets.map((m) => `${m.venue}:${m.symbol}:${m.timestamp}`).sort().join("|");
  return `market-scan-${now}-${key.length}-${markets.length}`;
}

function scoreMarket(m: MarketSnapshot): MarketScanCandidate {
  const spread = finiteOrZero(m.spreadBps) || (m.bid > 0 && m.ask >= m.bid ? ((m.ask - m.bid) / ((m.ask + m.bid) / 2)) * 10_000 : 10_000);
  const liquidity = clamp01(finiteOrZero(m.liquidityScore));
  const volume = clamp01(finiteOrZero(m.unusualVolume));
  const momentum = clamp01(Math.abs(finiteOrZero(m.return1h)) * 10 + Math.abs(finiteOrZero(m.return24h)) * 2);
  const volatility = clamp01(finiteOrZero(m.volatility) * 5);
  const relative = clamp01(finiteOrZero(m.relativeStrength));
  const spreadScore = clamp01(1 - spread / 50);
  const score = clamp01(liquidity * 0.30 + volume * 0.20 + momentum * 0.20 + volatility * 0.10 + relative * 0.10 + spreadScore * 0.10);
  const reasons: string[] = [];
  if (volume >= 0.6) reasons.push("unusual-volume");
  if (momentum >= 0.6) reasons.push("momentum");
  if (volatility >= 0.6) reasons.push("volatility");
  if (relative >= 0.6) reasons.push("relative-strength");
  if (liquidity >= 0.6) reasons.push("liquidity");
  if (!reasons.length) reasons.push("broad-market-ranking");
  return { symbol: m.symbol, venue: m.venue, market: m.market, score, reasons, snapshotTs: m.timestamp, sector: m.sector };
}

export class DeterministicMarketScanner implements MarketScanner {
  private readonly options: Required<Omit<MarketScannerOptions, "provenanceStore">>;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stopped = true;
  private highVolatility = false;
  private runningScan = false;
  private readonly candidateLastSeen = new Map<string, number>();
  private scansStarted = 0;
  private scansCompleted = 0;
  private scansFailed = 0;
  private lastScanCompletedAt: number | null = null;
  private lastScanId: string | null = null;
  private readonly provenanceStore?: MarketScanProvenanceStore;

  constructor(options: MarketScannerOptions = {}) {
    this.options = { ...DEFAULTS, ...options };
    this.provenanceStore = options.provenanceStore;
  }

  setHighVolatility(enabled: boolean): void { this.highVolatility = enabled; }

  getStatus(): MarketScannerStatus {
    return { running: !this.stopped, highVolatility: this.highVolatility, cadenceMs: this.highVolatility ? this.options.highVolatilityIntervalMs : this.options.normalIntervalMs, scansStarted: this.scansStarted, scansCompleted: this.scansCompleted, scansFailed: this.scansFailed, lastScanCompletedAt: this.lastScanCompletedAt, lastScanId: this.lastScanId };
  }

  scan(markets: MarketSnapshot[], now = Date.now()): MarketScanResult {
    this.scansStarted += 1;
    const startedAt = now;
    const universe = [...markets]
      .sort((a, b) => `${a.venue}:${a.symbol}`.localeCompare(`${b.venue}:${b.symbol}`))
      .slice(0, this.options.maxUniverseSize);
    const rejectionReasons: MarketScanRejectionSummary = { missing_identity: 0, invalid_price: 0, invalid_quote: 0, stale: 0, excessive_spread: 0, illiquid: 0 };
    const valid = universe.filter((m) => {
      if (!m.symbol.trim() || !m.venue.trim()) { rejectionReasons.missing_identity += 1; return false; }
      if (!Number.isFinite(m.last) || m.last <= 0) { rejectionReasons.invalid_price += 1; return false; }
      if (!Number.isFinite(m.bid) || !Number.isFinite(m.ask) || m.bid <= 0 || m.ask < m.bid) { rejectionReasons.invalid_quote += 1; return false; }
      if (!Number.isFinite(m.timestamp) || now - m.timestamp < 0 || now - m.timestamp > this.options.staleAfterMs) { rejectionReasons.stale += 1; return false; }
      const spread = finiteOrZero(m.spreadBps) || ((m.ask - m.bid) / ((m.ask + m.bid) / 2)) * 10_000;
      if (spread > this.options.maxSpreadBps) { rejectionReasons.excessive_spread += 1; return false; }
      if (finiteOrZero(m.liquidityScore) < this.options.minLiquidityScore) { rejectionReasons.illiquid += 1; return false; }
      return true;
    });
    const candidates = valid
      .map(scoreMarket)
      .sort((a, b) => b.score - a.score || `${a.venue}:${a.symbol}`.localeCompare(`${b.venue}:${b.symbol}`))
      .filter((c) => {
        const key = `${c.venue}:${c.symbol}`;
        const last = this.candidateLastSeen.get(key);
        return last == null || now - last >= this.options.candidateCooldownMs;
      })
      .slice(0, this.options.candidateLimit);
    for (const c of candidates) this.candidateLastSeen.set(`${c.venue}:${c.symbol}`, now);
    const result: MarketScanResult = {
      scanId: stableScanId(now, universe),
      cadence: this.highVolatility ? "high-volatility" : "normal",
      startedAt,
      completedAt: Date.now(),
      universeSize: universe.length,
      validMarkets: valid.length,
      rejectedMarkets: universe.length - valid.length,
      candidates,
      rejectionReasons,
      scoreVersion: SCORE_VERSION,
      policyVersion: POLICY_VERSION,
    };
    this.scansCompleted += 1;
    if (this.provenanceStore) void this.provenanceStore.append({ ...result, recordedAt: Date.now() });
    this.lastScanCompletedAt = result.completedAt;
    this.lastScanId = result.scanId;
    return result;
  }

  async scanFromUniverse(provider: MarketUniverseProvider, source: (symbols: string[]) => Promise<MarketSnapshot[]>, now = Date.now()): Promise<MarketScanResult> {
    const universe = await provider.getUniverse(now);
    const normalized = [...universe.entries].sort((a, b) => `${a.venue}:${a.symbol}`.localeCompare(`${b.venue}:${b.symbol}`)).slice(0, this.options.maxUniverseSize);
    const sourceSymbols = normalized.map((e) => e.symbol);
    let lastError: unknown;
    const sourceRequestTs = Date.now();
    let sourceCompletedTs = sourceRequestTs;
    let sourceAttempts = 0;
    let markets: MarketSnapshot[] = [];
    for (let attempt = 1; attempt <= this.options.sourceMaxAttempts; attempt += 1) {
      sourceAttempts = attempt;
      try {
        markets = await Promise.race([
          source(sourceSymbols),
          new Promise<MarketSnapshot[]>((_, reject) => setTimeout(() => reject(new Error("market_source_timeout")), this.options.sourceTimeoutMs)),
        ]);
        sourceCompletedTs = Date.now();
        break;
      } catch (error) {
        lastError = error;
        if (attempt < this.options.sourceMaxAttempts) await new Promise((resolve) => setTimeout(resolve, Math.min(1_000 * 2 ** (attempt - 1), 4_000)));
      }
    }
    if (sourceAttempts >= this.options.sourceMaxAttempts && markets.length === 0 && lastError) throw lastError;
    const result = this.scan(markets, now);
    return { ...result, universeId: universe.universeId, universeVersion: universe.version, universeAsOfTs: universe.asOfTs, provenance: { sourceRequestTs, sourceCompletedTs, sourceAttempts, sourceSymbols } };
  }

  async enqueueCandidates(result: MarketScanResult, queue: TaskQueue, now = Date.now()): Promise<number> {
    let inserted = 0;
    for (const candidate of result.candidates) {
      const taskId = `${result.scanId}:candidate:${candidate.venue}:${candidate.symbol}`;
      const outcome = await queue.enqueue({
        id: taskId,
        type: "market-candidate-analysis",
        payload: { scanId: result.scanId, candidate, observedAt: result.completedAt, asOfTs: result.completedAt, requiresPITEnrichment: true, evidenceRequiredBeforeTrade: true },
        routing: { market: candidate.market, family: "market-research", requiredCapability: "market-analysis" },
        priority: Math.round(candidate.score * 100),
        availableAt: now,
        maxAttempts: 4,
      });
      if (outcome.inserted) inserted += 1;
    }
    return inserted;
  }

  start(source: () => Promise<MarketSnapshot[]>, onScan?: (result: MarketScanResult) => Promise<void> | void): void {
    if (!this.stopped) return;
    this.stopped = false;
    const loop = async () => {
      if (this.stopped) return;
      if (this.runningScan) {
        this.timer = setTimeout(() => { void loop(); }, 1_000);
        return;
      }
      this.runningScan = true;
      try {
        const result = this.scan(await source());
        await onScan?.(result);
      } finally {
        this.runningScan = false;
        if (!this.stopped) {
          const delay = this.highVolatility ? this.options.highVolatilityIntervalMs : this.options.normalIntervalMs;
          this.timer = setTimeout(() => { void loop(); }, delay);
        }
      }
    };
    void loop();
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}

export interface CandidateExposureContext {
  equity: number;
  exposures: Array<{ symbol: string; notional: number; side: "long" | "short"; sector?: string; market?: string }>;
}

/** Removes candidates that would breach simple portfolio concentration limits. */
export function filterCandidatesByPortfolio(
  candidates: MarketScanCandidate[],
  context: CandidateExposureContext,
  maxSinglePct = 0.25,
  maxThemePct = 0.50,
): MarketScanCandidate[] {
  if (!(context.equity > 0)) return [];
  const bySymbol = new Map<string, number>();
  const byTheme = new Map<string, number>();
  for (const x of context.exposures) {
    bySymbol.set(x.symbol, (bySymbol.get(x.symbol) ?? 0) + Math.abs(x.notional));
    if (x.sector) byTheme.set(x.sector, (byTheme.get(x.sector) ?? 0) + Math.abs(x.notional));
  }
  return candidates.filter((c) => {
    const symbolExposure = (bySymbol.get(c.symbol) ?? 0) / context.equity;
    const theme = c.sector;
    const themeExposure = theme ? (byTheme.get(theme) ?? 0) / context.equity : 0;
    return symbolExposure < maxSinglePct && themeExposure < maxThemePct;
  });
}

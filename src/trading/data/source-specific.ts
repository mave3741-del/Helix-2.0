import { assertAdapterAdmitted } from './external-intelligence.ts';
import { HttpJsonSourceAdapter, type HttpFetchLike, type SourceFetchRequest, type SourceFetchResult } from "./source-ingestion.ts";
import { validatePointInTime } from "../point-in-time.ts";

export interface PointInTimeObservation<T = unknown> {
  subjectId: string;
  eventTs: number;
  publishedTs: number;
  availableTs: number;
  value: T;
  provenance: Record<string, unknown>;
}

export interface PointInTimeBatch<T = unknown> {
  source: string;
  asOfTs: number;
  observations: PointInTimeObservation<T>[];
  rejected: Array<{ subjectId: string; eventTs: number; reasons: string[] }>;
}

function parseDateOnly(value: string): number {
  const ts = Date.parse(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(ts)) throw new Error(`invalid_date:${value}`);
  return ts;
}

function parseTimestamp(value: string | number): number {
  if (typeof value === "string" && /^\d{8}T\d{6}$/.test(value)) {
    const year = Number(value.slice(0, 4));
    const month = Number(value.slice(4, 6)) - 1;
    const day = Number(value.slice(6, 8));
    const hour = Number(value.slice(9, 11));
    const minute = Number(value.slice(11, 13));
    const second = Number(value.slice(13, 15));
    const ts = Date.UTC(year, month, day, hour, minute, second);
    if (Number.isFinite(ts)) return ts;
  }
  const ts = typeof value === "number" ? value : Date.parse(value);
  if (!Number.isFinite(ts)) throw new Error(`invalid_timestamp:${value}`);
  return ts;
}

function buildQuery(baseUrl: string, params: Record<string, string | number | undefined>): string {
  const url = new URL(baseUrl);
  for (const [key, value] of Object.entries(params)) if (value !== undefined) url.searchParams.set(key, String(value));
  return url.toString();
}

export interface FredObservationRecord {
  date: string;
  value: string;
  realtime_start?: string;
  realtime_end?: string;
}

export interface FredObservationsResponse {
  realtime_start?: string;
  realtime_end?: string;
  observations?: FredObservationRecord[];
}

export interface FredAdapterConfig {
  apiKey: string;
  fetchImpl?: HttpFetchLike;
  baseUrl?: string;
}

/** FRED/ALFRED adapter. It requests an explicit real-time window so revisions can be replayed PIT-safely. */
export class FredSeriesAdapter {
  readonly id = "fred.series.observations";
  private readonly source: HttpJsonSourceAdapter;
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(config: FredAdapterConfig) {
    if (!/^[a-z0-9]{32}$/.test(config.apiKey)) throw new Error("fred_api_key_invalid");
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl ?? "https://api.stlouisfed.org/fred/series/observations";
    assertAdapterAdmitted('fred.alfred', this.id, this.baseUrl);
    const host = new URL(this.baseUrl).hostname;
    this.source = new HttpJsonSourceAdapter({ id: this.id, allowedHosts: [host], fetchImpl: config.fetchImpl });
  }

  async fetchObservations(input: {
    seriesId: string;
    realtimeStart: string;
    realtimeEnd: string;
    asOfTs?: number;
    observationStart?: string;
    observationEnd?: string;
  }): Promise<PointInTimeBatch<number>> {
    const asOfTs = input.asOfTs ?? Date.now();
    const url = buildQuery(this.baseUrl, {
      series_id: input.seriesId,
      api_key: this.apiKey,
      file_type: "json",
      realtime_start: input.realtimeStart,
      realtime_end: input.realtimeEnd,
      observation_start: input.observationStart,
      observation_end: input.observationEnd,
    });
    const fetched = await this.source.fetch({ url });
    return normalizeFredObservations(input.seriesId, fetched.data as FredObservationsResponse, fetched.fetchedAt, asOfTs, this.id);
  }
}

export function normalizeFredObservations(
  seriesId: string,
  payload: FredObservationsResponse,
  retrievedTs: number,
  asOfTs: number,
  source = "fred.series.observations",
): PointInTimeBatch<number> {
  const observations: PointInTimeObservation<number>[] = [];
  const rejected: PointInTimeBatch<number>["rejected"] = [];
  for (const row of payload.observations ?? []) {
    if (row.value === ".") continue;
    const eventTs = parseDateOnly(row.date);
    const publishedTs = row.realtime_start ? parseDateOnly(row.realtime_start) : retrievedTs;
    const availableTs = publishedTs;
    const value = Number(row.value);
    if (!Number.isFinite(value)) {
      rejected.push({ subjectId: seriesId, eventTs, reasons: ["invalid_value"] });
      continue;
    }
    const pit = validatePointInTime({ eventTs, publishedTs, availableTs }, asOfTs);
    if (!pit.ok) {
      rejected.push({ subjectId: seriesId, eventTs, reasons: pit.reasons });
      continue;
    }
    observations.push({
      subjectId: seriesId,
      eventTs,
      publishedTs,
      availableTs,
      value,
      provenance: { source, realtimeStart: row.realtime_start ?? null, realtimeEnd: row.realtime_end ?? null, retrievedTs },
    });
  }
  return { source, asOfTs, observations, rejected };
}

export interface SecFilingRecord {
  accessionNumber: string;
  form: string;
  filingDate: string;
  reportDate: string | null;
  acceptanceDateTime: string | null;
  primaryDocument?: string;
  cik: string;
  ticker?: string | null;
}

export interface SecSubmissionsResponse {
  cik: string;
  // Present on the real SEC API response but not read by the normalizer
  // below; kept optional so minimal test/mocked payloads aren't forced to
  // fabricate it.
  name?: string;
  tickers?: string[];
  exchanges?: string[];
  filings?: { recent?: {
    accessionNumber?: string[];
    form?: string[];
    filingDate?: string[];
    reportDate?: Array<string | null>;
    acceptanceDateTime?: Array<string | null>;
    primaryDocument?: string[];
  } };
}

export interface SecAdapterConfig {
  userAgent: string;
  fetchImpl?: HttpFetchLike;
  baseUrl?: string;
}

export class SecSubmissionsAdapter {
  readonly id = "sec.edgar.submissions";
  private readonly source: HttpJsonSourceAdapter;
  private readonly userAgent: string;
  private readonly baseUrl: string;

  constructor(config: SecAdapterConfig) {
    if (config.userAgent.trim().length < 8 || !config.userAgent.includes("@")) throw new Error("sec_user_agent_required");
    this.userAgent = config.userAgent.trim();
    this.baseUrl = config.baseUrl ?? "https://data.sec.gov/submissions";
    assertAdapterAdmitted('sec.edgar', this.id, this.baseUrl);
    const host = new URL(this.baseUrl).hostname;
    this.source = new HttpJsonSourceAdapter({ id: this.id, allowedHosts: [host], fetchImpl: config.fetchImpl });
  }

  async fetchRecent(cik: string, asOfTs = Date.now()): Promise<PointInTimeBatch<SecFilingRecord>> {
    const normalizedCik = cik.replace(/^CIK/i, "").padStart(10, "0");
    if (!/^\d{10}$/.test(normalizedCik)) throw new Error("sec_cik_invalid");
    const fetched = await this.source.fetch({
      url: `${this.baseUrl}/CIK${normalizedCik}.json`,
      headers: { "User-Agent": this.userAgent },
    });
    return normalizeSecSubmissions(fetched.data as SecSubmissionsResponse, fetched.fetchedAt, asOfTs, this.id);
  }
}

export function normalizeSecSubmissions(
  payload: SecSubmissionsResponse,
  retrievedTs: number,
  asOfTs: number,
  source = "sec.edgar.submissions",
): PointInTimeBatch<SecFilingRecord> {
  const recent = payload.filings?.recent ?? {};
  const accessions = recent.accessionNumber ?? [];
  const observations: PointInTimeObservation<SecFilingRecord>[] = [];
  const rejected: PointInTimeBatch<SecFilingRecord>["rejected"] = [];
  for (let i = 0; i < accessions.length; i += 1) {
    const accessionNumber = accessions[i];
    const filingDate = recent.filingDate?.[i];
    if (!accessionNumber || !filingDate) continue;
    const eventTs = parseDateOnly(recent.reportDate?.[i] ?? filingDate);
    const publishedTs = recent.acceptanceDateTime?.[i] ? parseTimestamp(recent.acceptanceDateTime[i]!) : parseDateOnly(filingDate);
    const availableTs = publishedTs;
    const pit = validatePointInTime({ eventTs, publishedTs, availableTs }, asOfTs);
    if (!pit.ok) {
      rejected.push({ subjectId: accessionNumber, eventTs, reasons: pit.reasons });
      continue;
    }
    const value: SecFilingRecord = {
      accessionNumber,
      form: recent.form?.[i] ?? "UNKNOWN",
      filingDate,
      reportDate: recent.reportDate?.[i] ?? null,
      acceptanceDateTime: recent.acceptanceDateTime?.[i] ?? null,
      primaryDocument: recent.primaryDocument?.[i],
      cik: payload.cik,
      ticker: payload.tickers?.[0] ?? null,
    };
    observations.push({
      subjectId: payload.tickers?.[0] ?? payload.cik,
      eventTs,
      publishedTs,
      availableTs,
      value,
      provenance: { source, cik: payload.cik, accessionNumber, retrievedTs },
    });
  }
  return { source, asOfTs, observations, rejected };
}


export interface AlpacaBar {
  t: string;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
  n?: number;
  vw?: number;
}

export interface AlpacaBarsResponse {
  bars?: Record<string, AlpacaBar[]>;
  next_page_token?: string | null;
}

export interface AlpacaHistoricalBarsConfig {
  keyId: string;
  secretKey: string;
  fetchImpl?: HttpFetchLike;
  baseUrl?: string;
  cryptoBaseUrl?: string;
}

export interface AlpacaHistoricalBarsInput {
  symbol: string;
  timeframe: string;
  start: string;
  end: string;
  asOfTs?: number;
  feed?: string;
  adjustment?: string;
  currency?: string;
  pageLimit?: number;
  maxPages?: number;
  asset?: "stock" | "crypto";
  cryptoLocation?: "us" | "us-1" | "eu-1" | "us-2" | "bs-1";
}

const ALPACA_TIMEFRAME_MS: Record<string, number> = {
  "1Min": 60_000, "1Day": 86_400_000, "1Week": 604_800_000,
};

function timeframeDurationMs(timeframe: string): number {
  const direct = ALPACA_TIMEFRAME_MS[timeframe];
  if (direct) return direct;
  const match = timeframe.match(/^(\d+)(Min|T|Hour|H|Day|D|Week|W|Month|M)$/i);
  if (!match) throw new Error(`alpaca_timeframe_unsupported:${timeframe}`);
  const amount = Number(match[1]);
  if (!Number.isInteger(amount) || amount <= 0) throw new Error(`alpaca_timeframe_invalid:${timeframe}`);
  const unit = match[2].toLowerCase();
  const unitMs = unit === "min" || unit === "t" ? 60_000
    : unit === "hour" || unit === "h" ? 3_600_000
    : unit === "day" || unit === "d" ? 86_400_000
    : unit === "week" || unit === "w" ? 604_800_000
    : 2_592_000_000;
  return amount * unitMs;
}

function normalizeAlpacaBars(
  symbol: string,
  bars: AlpacaBar[],
  timeframe: string,
  retrievedTs: number,
  asOfTs: number,
  source: string,
): PointInTimeBatch<AlpacaBar> {
  const observations: PointInTimeObservation<AlpacaBar>[] = [];
  const rejected: PointInTimeBatch<AlpacaBar>["rejected"] = [];
  const durationMs = timeframeDurationMs(timeframe);
  for (const bar of bars) {
    const eventTs = parseTimestamp(bar.t);
    const availableTs = eventTs + durationMs;
    const publishedTs = availableTs;
    const numeric = [bar.o, bar.h, bar.l, bar.c, bar.v].every(Number.isFinite);
    const validOhlc = bar.h >= Math.max(bar.o, bar.c, bar.l) && bar.l <= Math.min(bar.o, bar.c, bar.h);
    if (!numeric || !validOhlc || bar.v < 0) {
      rejected.push({ subjectId: symbol, eventTs, reasons: ["invalid_market_bar"] });
      continue;
    }
    const pit = validatePointInTime({ eventTs, publishedTs, availableTs }, asOfTs);
    if (!pit.ok) {
      rejected.push({ subjectId: symbol, eventTs, reasons: pit.reasons });
      continue;
    }
    observations.push({
      subjectId: symbol, eventTs, publishedTs, availableTs, value: bar,
      provenance: { source, symbol, timeframe, retrievedTs },
    });
  }
  return { source, asOfTs, observations, rejected };
}

/**
 * Read-only Alpaca historical bars connector. It deliberately models bar availability
 * at bar end rather than bar start, preventing close/high/low/volume leakage into earlier
 * decisions. Stock and crypto endpoints follow Alpaca's documented historical-data APIs.
 */
export class AlpacaHistoricalBarsAdapter {
  readonly id = "alpaca.market-data.historical-bars";
  private readonly source: HttpJsonSourceAdapter;
  private readonly cryptoSource: HttpJsonSourceAdapter;
  private readonly keyId: string;
  private readonly secretKey: string;
  private readonly baseUrl: string;
  private readonly cryptoBaseUrl: string;

  constructor(config: AlpacaHistoricalBarsConfig) {
    if (config.keyId.trim().length < 8 || config.secretKey.trim().length < 8) throw new Error("alpaca_credentials_required");
    this.keyId = config.keyId.trim();
    this.secretKey = config.secretKey.trim();
    this.baseUrl = config.baseUrl ?? "https://data.alpaca.markets/v2";
    this.cryptoBaseUrl = config.cryptoBaseUrl ?? "https://data.alpaca.markets/v1beta3/crypto";
    const host = new URL(this.baseUrl).hostname;
    const cryptoHost = new URL(this.cryptoBaseUrl).hostname;
    this.source = new HttpJsonSourceAdapter({ id: this.id, allowedHosts: [host], fetchImpl: config.fetchImpl, defaultMaxBytes: 8_000_000 });
    this.cryptoSource = new HttpJsonSourceAdapter({ id: `${this.id}.crypto`, allowedHosts: [cryptoHost], fetchImpl: config.fetchImpl, defaultMaxBytes: 8_000_000 });
  }

  async fetchBars(input: AlpacaHistoricalBarsInput): Promise<PointInTimeBatch<AlpacaBar>> {
    const symbol = input.symbol.trim();
    if (!symbol) throw new Error("alpaca_symbol_required");
    const asset = input.asset ?? "stock";
    const asOfTs = input.asOfTs ?? Date.now();
    const pageLimit = Math.min(10_000, Math.max(1, input.pageLimit ?? 1_000));
    const maxPages = Math.min(100, Math.max(1, input.maxPages ?? 10));
    const common = { timeframe: input.timeframe, start: input.start, end: input.end, limit: pageLimit, sort: "asc", page_token: undefined as string | undefined };
    let pageToken: string | undefined;
    const all: AlpacaBar[] = [];
    let retrievedTs = 0;
    for (let page = 0; page < maxPages; page += 1) {
      const params: Record<string, string | number | undefined> = { ...common, page_token: pageToken };
      let url: string;
      let source: HttpJsonSourceAdapter;
      if (asset === "crypto") {
        const location = input.cryptoLocation ?? "us";
        url = buildQuery(`${this.cryptoBaseUrl}/${location}/bars`, { symbols: symbol, ...params });
        source = this.cryptoSource;
      } else {
        url = buildQuery(`${this.baseUrl}/stocks/bars`, { symbols: symbol, feed: input.feed ?? "iex", adjustment: input.adjustment ?? "raw", currency: input.currency, ...params });
        source = this.source;
      }
      const fetched = await source.fetch({ url, headers: { "APCA-API-KEY-ID": this.keyId, "APCA-API-SECRET-KEY": this.secretKey } });
      retrievedTs = retrievedTs || fetched.fetchedAt;
      const payload = fetched.data as AlpacaBarsResponse;
      all.push(...(payload.bars?.[symbol] ?? payload.bars?.[symbol.toUpperCase()] ?? []));
      if (!payload.next_page_token) break;
      pageToken = payload.next_page_token;
      if (page === maxPages - 1) throw new Error("alpaca_max_pages_exceeded");
    }
    return normalizeAlpacaBars(symbol, all, input.timeframe, retrievedTs || Date.now(), asOfTs, `${this.id}.${asset}`);
  }
}

export interface AlphaVantageNewsFeedItem {
  title?: string;
  url?: string;
  time_published?: string;
  overall_sentiment_score?: number;
  overall_sentiment_label?: string;
  summary?: string;
  source?: string;
  ticker_sentiment?: Array<{ ticker?: string; ticker_sentiment_score?: number }>;
}

export interface AlphaVantageNewsResponse { feed?: AlphaVantageNewsFeedItem[]; }

export interface AlphaVantageNewsConfig {
  apiKey: string;
  fetchImpl?: HttpFetchLike;
  baseUrl?: string;
}

export class AlphaVantageNewsAdapter {
  readonly id = "alphavantage.news.sentiment";
  private readonly source: HttpJsonSourceAdapter;
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(config: AlphaVantageNewsConfig) {
    if (!config.apiKey.trim()) throw new Error("alphavantage_api_key_required");
    this.apiKey = config.apiKey.trim();
    this.baseUrl = config.baseUrl ?? "https://www.alphavantage.co/query";
    const host = new URL(this.baseUrl).hostname;
    this.source = new HttpJsonSourceAdapter({ id: this.id, allowedHosts: [host], fetchImpl: config.fetchImpl, defaultMaxBytes: 2_000_000 });
  }

  async fetchNews(input: { tickers?: string[]; timeFrom?: string; timeTo?: string; limit?: number; asOfTs?: number }): Promise<PointInTimeBatch<AlphaVantageNewsFeedItem>> {
    const asOfTs = input.asOfTs ?? Date.now();
    const url = buildQuery(this.baseUrl, {
      function: "NEWS_SENTIMENT",
      tickers: input.tickers?.join(","),
      time_from: input.timeFrom,
      time_to: input.timeTo,
      limit: input.limit,
      apikey: this.apiKey,
    });
    const fetched = await this.source.fetch({ url });
    return normalizeAlphaVantageNews(fetched.data as AlphaVantageNewsResponse, fetched.fetchedAt, asOfTs, this.id);
  }
}

export function normalizeAlphaVantageNews(
  payload: AlphaVantageNewsResponse,
  retrievedTs: number,
  asOfTs: number,
  source = "alphavantage.news.sentiment",
): PointInTimeBatch<AlphaVantageNewsFeedItem> {
  const observations: PointInTimeObservation<AlphaVantageNewsFeedItem>[] = [];
  const rejected: PointInTimeBatch<AlphaVantageNewsFeedItem>["rejected"] = [];
  for (const item of payload.feed ?? []) {
    if (!item.time_published) continue;
    const publishedTs = parseTimestamp(item.time_published.replace(/^(\d{8}T\d{6}).*$/, "$1"));
    const eventTs = publishedTs;
    const availableTs = publishedTs;
    const subjectId = item.ticker_sentiment?.find((x) => x.ticker)?.ticker ?? item.url ?? item.title ?? "news";
    const pit = validatePointInTime({ eventTs, publishedTs, availableTs }, asOfTs);
    if (!pit.ok) {
      rejected.push({ subjectId, eventTs, reasons: pit.reasons });
      continue;
    }
    observations.push({
      subjectId,
      eventTs,
      publishedTs,
      availableTs,
      value: item,
      provenance: { source, publisher: item.source ?? null, url: item.url ?? null, retrievedTs },
    });
  }
  return { source, asOfTs, observations, rejected };
}

export type SourceSpecificAdapter = FredSeriesAdapter | SecSubmissionsAdapter | AlphaVantageNewsAdapter | AlpacaHistoricalBarsAdapter;

export function buildSourceRequest(adapter: SourceSpecificAdapter, request: SourceFetchRequest): SourceFetchRequest {
  void adapter;
  return request;
}

export function sourceFetchMetadata(result: SourceFetchResult): Record<string, unknown> {
  return { url: result.url, status: result.status, fetchedAt: result.fetchedAt, headers: result.headers };
}

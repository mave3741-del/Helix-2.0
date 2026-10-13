import { HttpJsonSourceAdapter, HttpTextSourceAdapter, type HttpFetchLike } from './data/source-ingestion.ts';
import { normalize13FHolding, normalizeCftcPositioning, normalizeOnChainTransfers, type CftcPositioningInput, type Institutional13FHoldingInput, type OnChainTransferInput } from './smart-money.ts';
import type { PointInTimeBatch } from './data/source-specific.ts';
import type { SmartMoneyObservation } from './smart-money.ts';
import { lookup } from 'node:dns/promises';


async function assertPublicResolvedHost(host: string): Promise<void> {
  const rows = await lookup(host, { all: true });
  for (const row of rows) {
    const lower = row.address.toLowerCase();
    const parts = row.address.split('.').map(Number);
    const privateV4 = parts.length === 4 && parts.every(Number.isInteger) && (parts[0] === 0 || parts[0] === 10 || parts[0] === 127 || (parts[0] === 169 && parts[1] === 254) || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) || (parts[0] === 192 && parts[1] === 168) || (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) || (parts[0] === 198 && (parts[1] === 18 || parts[1] === 19)));
    const privateV6 = lower === '::1' || lower.startsWith('::ffff:') || lower.startsWith('fc') || lower.startsWith('fd') || lower.startsWith('fe80:');
    if (privateV4 || privateV6) throw new Error('source_private_address_not_allowed');
  }
  if (!rows.length) throw new Error('source_dns_resolution_failed');
}

export interface SmartMoneyFetchPolicy { allowedHosts: string[]; timeoutMs?: number; maxBytes?: number; headers?: Record<string,string>; }

function assertHost(url: string, policy: SmartMoneyFetchPolicy) {
  const parsed = new URL(url);
  if (!['https:', 'http:'].includes(parsed.protocol)) throw new Error('source_protocol_not_allowed');
  if (parsed.username || parsed.password) throw new Error('source_credentials_rejected');
  const host = parsed.hostname.toLowerCase();
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1' || host.endsWith('.localhost') || host.endsWith('.local')) throw new Error('source_private_host_not_allowed');
  if (!policy.allowedHosts.map((h) => h.toLowerCase()).includes(host)) throw new Error('source_host_not_allowlisted');
  return parsed;
}

export async function fetchJson(url: string, policy: SmartMoneyFetchPolicy): Promise<unknown> {
  const parsed = assertHost(url, policy);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(250, Math.min(30_000, policy.timeoutMs ?? 8_000)));
  try {
    await assertPublicResolvedHost(parsed.hostname);
    const response = await fetch(parsed, { method:'GET', redirect:'error', signal:controller.signal, headers:{ 'accept':'application/json', 'user-agent':'Helix/1 trading-research', ...(policy.headers ?? {}) } });
    if (!response.ok) throw new Error(`source_http_${response.status}`);
    const text = await response.text();
    if (new TextEncoder().encode(text).byteLength > (policy.maxBytes ?? 1_000_000)) throw new Error('source_response_too_large');
    return JSON.parse(text);
  } finally { clearTimeout(timer); }
}

export function parseOnChain(payload: OnChainTransferInput, asOfTs = Date.now()): PointInTimeBatch<SmartMoneyObservation> { return normalizeOnChainTransfers(payload, asOfTs); }
export function parse13F(payload: Institutional13FHoldingInput, asOfTs = Date.now()): PointInTimeBatch<SmartMoneyObservation> { return normalize13FHolding(payload, asOfTs); }
export function parseCOT(payload: CftcPositioningInput, asOfTs = Date.now()): PointInTimeBatch<SmartMoneyObservation> { return normalizeCftcPositioning(payload, asOfTs); }

export interface SmartMoneyFetchAdapter<TInput> { source: string; fetch(url: string, policy: SmartMoneyFetchPolicy): Promise<PointInTimeBatch<SmartMoneyObservation>>; parse(input: TInput, asOfTs?: number): PointInTimeBatch<SmartMoneyObservation>; }

export interface OnChainTransferFeedResponse { transfers?: OnChainTransferInput[]; data?: OnChainTransferInput[]; }
export interface OnChainAdapterConfig { endpoint: string; allowedHosts: string[]; fetchImpl?: HttpFetchLike; headers?: Record<string,string>; }

export class OnChainTransferHttpAdapter {
  readonly source = 'onchain';
  private readonly sourceAdapter: HttpJsonSourceAdapter;
  private readonly endpoint: string;
  constructor(config: OnChainAdapterConfig) {
    this.endpoint = config.endpoint;
    const host = new URL(config.endpoint).hostname;
    if (!config.allowedHosts.map((h) => h.toLowerCase()).includes(host.toLowerCase())) throw new Error('onchain_endpoint_not_allowlisted');
    this.sourceAdapter = new HttpJsonSourceAdapter({ id: 'smart-money.onchain', allowedHosts: config.allowedHosts, fetchImpl: config.fetchImpl });
  }
  async fetchTransfers(input: { asset?: string; fromBlock?: number; toBlock?: number; asOfTs?: number; retrievedTs?: number }): Promise<PointInTimeBatch<SmartMoneyObservation>> {
    const url = new URL(this.endpoint);
    if (input.asset) url.searchParams.set('asset', input.asset);
    if (input.fromBlock != null) url.searchParams.set('fromBlock', String(input.fromBlock));
    if (input.toBlock != null) url.searchParams.set('toBlock', String(input.toBlock));
    const fetched = await this.sourceAdapter.fetch({ url: url.toString() });
    const payload = fetched.data as OnChainTransferFeedResponse | OnChainTransferInput[];
    const rows = Array.isArray(payload) ? payload : (payload.transfers ?? payload.data ?? []);
    const asOfTs = input.asOfTs ?? fetched.fetchedAt;
    const retrievedTs = input.retrievedTs ?? fetched.fetchedAt;
    const observations: SmartMoneyObservation[] = [];
    const rejected: PointInTimeBatch<SmartMoneyObservation>['rejected'] = [];
    for (const row of rows) {
      const batch = normalizeOnChainTransfers({ ...row, source: row.source || this.source, retrievedTs }, asOfTs);
      observations.push(...batch.observations.map((x) => x.value)); rejected.push(...batch.rejected);
    }
    return { source: this.source, asOfTs, observations: observations.map((value) => ({ subjectId: value.asset, eventTs: value.eventTs, publishedTs: value.publishedTs, availableTs: value.availableTs, value, provenance: value.provenance })), rejected };
  }
}

export interface Sec13FInformationTableAdapterConfig { allowedHosts?: string[]; fetchImpl?: HttpFetchLike; source?: string; valueUnitMultiplier?: number; }
function xmlTag(block: string, names: string[]): string | null {
  for (const name of names) {
    const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i'));
    if (m) return m[1].replace(/&amp;/g, '&').trim();
  }
  return null;
}
function parseSec13FXml(text: string, context: { filerId: string; filerName?: string; reportPeriod: number; filedAt: number; source: string; retrievedTs: number; asOfTs: number; valueUnitMultiplier: number }): PointInTimeBatch<SmartMoneyObservation> {
  const blocks = [...text.matchAll(/<INFO_TABLE[\s\S]*?<\/INFO_TABLE>/gi)].map((m) => m[0]);
  const observations: SmartMoneyObservation[] = []; const rejected: PointInTimeBatch<SmartMoneyObservation>['rejected'] = [];
  for (const block of blocks) {
    const issuer = xmlTag(block, ['NAMEOFISSUER','NAME_OF_ISSUER']);
    const cusip = xmlTag(block, ['CUSIP']);
    const sharesRaw = xmlTag(block, ['SSHPRNAMT','SHRSORPRNAMT','SHARES']);
    const valueRaw = xmlTag(block, ['VALUE','VALUEOF']);
    if (!issuer || !sharesRaw) continue;
    const shares = Number(sharesRaw.replace(/[^0-9.-]/g, ''));
    const adjustedValueNumber = valueRaw == null ? undefined : Number(valueRaw.replace(/[^0-9.-]/g, '')) * context.valueUnitMultiplier;
    const batch = normalize13FHolding({ filerId: context.filerId, filerName: context.filerName, issuer, cusip: cusip ?? undefined, shares, valueUsd: Number.isFinite(adjustedValueNumber ?? NaN) ? adjustedValueNumber : undefined, reportPeriod: context.reportPeriod, filedAt: context.filedAt, source: context.source, retrievedTs: context.retrievedTs }, context.asOfTs);
    observations.push(...batch.observations.map((x) => x.value)); rejected.push(...batch.rejected);
  }
  return { source: context.source, asOfTs: context.asOfTs, observations: observations.map((value) => ({ subjectId: value.asset, eventTs: value.eventTs, publishedTs: value.publishedTs, availableTs: value.availableTs, value, provenance: value.provenance })), rejected };
}

export class Sec13FInformationTableHttpAdapter {
  readonly source = 'institutional-13f';
  private readonly sourceAdapter: HttpTextSourceAdapter;
  private readonly valueUnitMultiplier: number;
  private readonly configuredValueUnitMultiplier: number | undefined;
  constructor(config: Sec13FInformationTableAdapterConfig = {}) {
    const allowedHosts = config.allowedHosts ?? ['www.sec.gov', 'www.sec.gov'];
    this.configuredValueUnitMultiplier = config.valueUnitMultiplier;
    this.valueUnitMultiplier = config.valueUnitMultiplier ?? 1; // current SEC XML schema reports VALUE in dollars; historical filings can opt into an explicit multiplier
    this.sourceAdapter = new HttpTextSourceAdapter({ id: 'smart-money.sec-13f-information-table', allowedHosts, fetchImpl: config.fetchImpl });
  }
  async fetchInformationTable(input: { url: string; filerId: string; filerName?: string; reportPeriod: number; filedAt: number; asOfTs?: number }): Promise<PointInTimeBatch<SmartMoneyObservation>> {
    const fetched = await this.sourceAdapter.fetch({ url: input.url, headers: { 'User-Agent': 'Helix/1 research-contact' } });
    const effectiveMultiplier = this.configuredValueUnitMultiplier ?? (input.filedAt < Date.parse('2023-01-03T00:00:00Z') ? 1000 : 1);
    return parseSec13FXml(fetched.data, { filerId: input.filerId, filerName: input.filerName, reportPeriod: input.reportPeriod, filedAt: input.filedAt, source: this.source, retrievedTs: fetched.fetchedAt, asOfTs: input.asOfTs ?? fetched.fetchedAt, valueUnitMultiplier: effectiveMultiplier });
  }
}

export interface CftcCsvFieldMap { market: string; reportDate: string; category: string; long: string; short: string; openInterest?: string; releaseDate?: string; }
export class CftcCotCsvHttpAdapter {
  readonly source = 'futures-cot';
  private readonly sourceAdapter: HttpTextSourceAdapter;
  private readonly fieldMap: CftcCsvFieldMap;
  constructor(config: { endpoint: string; allowedHosts?: string[]; fetchImpl?: HttpFetchLike; fieldMap?: CftcCsvFieldMap }) {
    const allowedHosts = config.allowedHosts ?? [new URL(config.endpoint).hostname];
    this.fieldMap = config.fieldMap ?? { market: 'Contract Market Name', reportDate: 'Report Date', category: 'Market and Exchange Names', long: 'Long', short: 'Short', releaseDate: 'Release Date' };
    this.sourceAdapter = new HttpTextSourceAdapter({ id: 'smart-money.cftc-cot', allowedHosts, fetchImpl: config.fetchImpl, defaultMaxBytes: 4_000_000 });
    this.endpoint = config.endpoint;
  }
  private readonly endpoint: string;
  async fetchReport(input: { asOfTs?: number; source?: string; releaseLagMs?: number }): Promise<PointInTimeBatch<SmartMoneyObservation>> {
    const fetched = await this.sourceAdapter.fetch({ url: this.endpoint });
    const rows = parseCsv(fetched.data);
    const asOfTs = input.asOfTs ?? fetched.fetchedAt;
    const observations: SmartMoneyObservation[] = []; const rejected: PointInTimeBatch<SmartMoneyObservation>['rejected'] = [];
    for (const row of rows) {
      const eventTs = Date.parse(row[this.fieldMap.reportDate] ?? '');
      const releaseRaw = this.fieldMap.releaseDate ? (row[this.fieldMap.releaseDate] ?? '') : '';
      const explicitReleaseTs = releaseRaw ? parseCftcReleaseTimestamp(releaseRaw) : NaN;
      if (!Number.isFinite(explicitReleaseTs) && input.releaseLagMs == null) {
        rejected.push({ subjectId: row[this.fieldMap.market] ?? 'unknown', eventTs, reasons: ['cftc_release_timestamp_required'] });
        continue;
      }
      const releaseLagMs = Math.max(0, input.releaseLagMs ?? 0);
      const availableTs = Number.isFinite(explicitReleaseTs) ? explicitReleaseTs : (eventTs + releaseLagMs);
      const long = Number(row[this.fieldMap.long]); const short = Number(row[this.fieldMap.short]);
      if (!Number.isFinite(eventTs) || !Number.isFinite(long) || !Number.isFinite(short) || !Number.isFinite(availableTs)) continue;
      const batch = normalizeCftcPositioning({ market: row[this.fieldMap.market] ?? 'unknown', reportDate: eventTs, publishedTs: availableTs, availableTs, long, short, openInterest: this.fieldMap.openInterest ? Number(row[this.fieldMap.openInterest]) : undefined, category: row[this.fieldMap.category] ?? 'unknown', source: input.source ?? this.source, retrievedTs: fetched.fetchedAt }, asOfTs);
      observations.push(...batch.observations.map((x) => x.value)); rejected.push(...batch.rejected);
    }
    return { source: this.source, asOfTs, observations: observations.map((value) => ({ subjectId: value.asset, eventTs: value.eventTs, publishedTs: value.publishedTs, availableTs: value.availableTs, value, provenance: value.provenance })), rejected };
  }
}


function parseCftcReleaseTimestamp(raw: string): number {
  const trimmed = raw.trim();
  const explicit = Date.parse(trimmed);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return explicit;
  const [y,m,d] = trimmed.split('-').map(Number);
  // CFTC publishes the weekly COT report at 3:30pm Eastern on the release date.
  // Resolve EST/EDT with Intl rather than hard-coding a UTC offset.
  const utcGuess = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const parts = new Intl.DateTimeFormat('en-US', { timeZone:'America/New_York', timeZoneName:'shortOffset', year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', second:'2-digit', hourCycle:'h23' }).formatToParts(utcGuess);
  const offsetPart = parts.find((p)=>p.type==='timeZoneName')?.value ?? 'GMT-5';
  const offsetMatch = offsetPart.match(/GMT([+-])(\d+)(?::(\d+))?/);
  const offsetMinutes = offsetMatch ? (Number(offsetMatch[2])*60 + Number(offsetMatch[3] ?? 0)) * (offsetMatch[1] === '+' ? 1 : -1) : -300;
  const localAsUtc = Date.UTC(y,m-1,d,15,30,0);
  return localAsUtc - offsetMinutes*60*1000;
}

function parseCsv(text: string): Array<Record<string,string>> {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length);
  if (!lines.length) return [];
  const parseLine = (line: string) => {
    const out: string[] = []; let current = ''; let quoted = false;
    for (let i=0; i<line.length; i++) { const c=line[i]; if (c==='"') { if (quoted && line[i+1]==='"') { current+='"'; i++; } else quoted=!quoted; } else if (c===',' && !quoted) { out.push(current.trim()); current=''; } else current+=c; }
    out.push(current.trim()); return out;
  };
  const headers = parseLine(lines[0]);
  return lines.slice(1).map((line) => { const vals=parseLine(line); return Object.fromEntries(headers.map((h,i)=>[h, vals[i] ?? ''])); });
}

export async function fetchSmartMoneyBatch(adapter: OnChainTransferHttpAdapter | Sec13FInformationTableHttpAdapter | CftcCotCsvHttpAdapter, input: any): Promise<PointInTimeBatch<SmartMoneyObservation>> {
  if (adapter instanceof OnChainTransferHttpAdapter) return adapter.fetchTransfers(input);
  if (adapter instanceof Sec13FInformationTableHttpAdapter) return adapter.fetchInformationTable(input);
  return adapter.fetchReport(input);
}

import { buildEvidencePacket, EvidenceFanoutService, type EvidenceStore, type TradingEvidencePacket, type EvidenceFanoutOptions } from "../evidence.ts";
import { stableHash } from '../runtime/task-results.ts';
import { lookup } from 'node:dns/promises';

export interface SourceFetchRequest {
  url: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
  maxBytes?: number;
}

export interface SourceFetchResult<T = unknown> {
  url: string;
  status: number;
  fetchedAt: number;
  headers: Record<string, string>;
  data: T;
  contentHash?: string;
}

export interface SourceAdapter<T = unknown> {
  readonly id: string;
  readonly kind: "http-json" | "http-text";
  fetch(request: SourceFetchRequest): Promise<SourceFetchResult<T>>;
}

export interface HttpFetchLike {
  (input: string, init?: RequestInit): Promise<Response>;
}

const SAFE_PROTOCOLS = new Set(["https:", "http:"]);
const PRIVATE_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1"]);

function privateAddress(address: string): boolean {
  const lower = address.toLowerCase();
  if (lower.startsWith('::ffff:') || lower === '::1' || lower.startsWith('fc') || lower.startsWith('fd') || lower.startsWith('fe80:')) return true;
  const parts = address.split('.').map(Number);
  if (parts.length === 4 && parts.every(Number.isInteger)) {
    const [a,b] = parts;
    if (a === 0 || a === 10 || a === 127 || a === 169 && b === 254 || a === 172 && b >= 16 && b <= 31 || a === 192 && b === 168 || a === 100 && b >= 64 && b <= 127 || a === 198 && (b === 18 || b === 19)) return true;
  }
  return false;
}

async function assertResolvedHostPublic(host: string): Promise<void> {
  const rows = await lookup(host, { all: true });
  if (!rows.length || rows.some((row) => privateAddress(row.address))) throw new Error('source_private_address_not_allowed');
}

function assertSafeEndpoint(rawUrl: string, allowedHosts: Set<string>): URL {
  const url = new URL(rawUrl);
  if (!SAFE_PROTOCOLS.has(url.protocol)) throw new Error("source_url_protocol_not_allowed");
  if (url.username || url.password) throw new Error("source_url_credentials_not_allowed");
  const host = url.hostname.toLowerCase();
  if (PRIVATE_HOSTS.has(host) || host.endsWith(".localhost") || host.endsWith(".local")) {
    throw new Error("source_private_host_not_allowed");
  }
  if (!allowedHosts.has(host)) throw new Error("source_host_not_allowlisted");
  return url;
}

async function readJsonWithLimit(response: Response, maxBytes: number): Promise<unknown> {
  const contentLength = Number(response.headers.get("content-length") ?? "0");
  if (contentLength > maxBytes) throw new Error("source_response_too_large");
  const reader = response.body?.getReader();
  if (!reader) return response.json();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const next = await reader.read();
    if (next.done) break;
    total += next.value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error("source_response_too_large");
    }
    chunks.push(next.value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder().decode(bytes));
}

export class HttpJsonSourceAdapter implements SourceAdapter {
  readonly id: string;
  readonly kind = "http-json" as const;
  private readonly allowedHosts: Set<string>;
  private readonly fetchImpl: HttpFetchLike;
  private readonly defaultTimeoutMs: number;
  private readonly defaultMaxBytes: number;

  constructor(input: {
    id: string;
    allowedHosts: string[];
    fetchImpl?: HttpFetchLike;
    defaultTimeoutMs?: number;
    defaultMaxBytes?: number;
  }) {
    if (!input.id.trim()) throw new Error("source_adapter_id_required");
    if (!input.allowedHosts.length) throw new Error("source_allowlist_required");
    this.id = input.id;
    this.allowedHosts = new Set(input.allowedHosts.map((host) => host.toLowerCase().trim()).filter(Boolean));
    this.fetchImpl = input.fetchImpl ?? fetch;
    this.defaultTimeoutMs = Math.min(120_000, Math.max(250, input.defaultTimeoutMs ?? 15_000));
    this.defaultMaxBytes = Math.min(10_000_000, Math.max(1_024, input.defaultMaxBytes ?? 1_000_000));
  }

  async fetch(request: SourceFetchRequest): Promise<SourceFetchResult> {
    const url = assertSafeEndpoint(request.url, this.allowedHosts);
    if (this.fetchImpl === fetch) await assertResolvedHostPublic(url.hostname);
    const timeoutMs = Math.min(120_000, Math.max(250, request.timeoutMs ?? this.defaultTimeoutMs));
    const maxBytes = Math.min(10_000_000, Math.max(1_024, request.maxBytes ?? this.defaultMaxBytes));
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort("source_timeout"), timeoutMs);
    try {
      const response = await this.fetchImpl(url.toString(), {
        method: "GET",
        redirect: "error",
        headers: { accept: "application/json", ...(request.headers ?? {}) },
        signal: controller.signal,
      });
      const headers: Record<string, string> = {};
      response.headers.forEach((value, key) => { headers[key] = value; });
      if (!response.ok) throw new Error(`source_http_${response.status}`);
      const data = await readJsonWithLimit(response, maxBytes);
      return { url: url.toString(), status: response.status, fetchedAt: Date.now(), headers, data, contentHash: await stableHash({ url: url.toString(), data }) };
    } catch (error) {
      if (controller.signal.aborted) throw new Error("source_fetch_timeout");
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
}


async function readTextWithLimit(response: Response, maxBytes: number): Promise<string> {
  const contentLength = Number(response.headers.get('content-length') ?? '0');
  if (contentLength > maxBytes) throw new Error('source_response_too_large');
  const reader = response.body?.getReader();
  if (!reader) return response.text();
  const chunks: Uint8Array[] = []; let total = 0;
  while (true) {
    const next = await reader.read();
    if (next.done) break;
    total += next.value.byteLength;
    if (total > maxBytes) { await reader.cancel(); throw new Error('source_response_too_large'); }
    chunks.push(next.value);
  }
  const bytes = new Uint8Array(total); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(bytes);
}

export class HttpTextSourceAdapter implements SourceAdapter<string> {
  readonly kind = "http-text" as const;
  private readonly allowedHosts: Set<string>;
  private readonly fetchImpl: HttpFetchLike;
  private readonly defaultTimeoutMs: number;
  private readonly defaultMaxBytes: number;
  readonly id: string;

  constructor(input: { id: string; allowedHosts: string[]; fetchImpl?: HttpFetchLike; defaultTimeoutMs?: number; defaultMaxBytes?: number }) {
    if (!input.id.trim()) throw new Error("source_adapter_id_required");
    if (!input.allowedHosts.length) throw new Error("source_allowlist_required");
    this.id = input.id;
    this.allowedHosts = new Set(input.allowedHosts.map((host) => host.toLowerCase().trim()).filter(Boolean));
    this.fetchImpl = input.fetchImpl ?? fetch;
    this.defaultTimeoutMs = Math.min(120_000, Math.max(250, input.defaultTimeoutMs ?? 15_000));
    this.defaultMaxBytes = Math.min(10_000_000, Math.max(1_024, input.defaultMaxBytes ?? 2_000_000));
  }

  async fetch(request: SourceFetchRequest): Promise<SourceFetchResult<string>> {
    const url = assertSafeEndpoint(request.url, this.allowedHosts);
    if (this.fetchImpl === fetch) await assertResolvedHostPublic(url.hostname);
    const timeoutMs = Math.min(120_000, Math.max(250, request.timeoutMs ?? this.defaultTimeoutMs));
    const maxBytes = Math.min(10_000_000, Math.max(1_024, request.maxBytes ?? this.defaultMaxBytes));
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort("source_timeout"), timeoutMs);
    try {
      const response = await this.fetchImpl(url.toString(), {
        method: "GET", redirect: "error", headers: { accept: "text/plain, application/xml, text/xml, text/csv, */*", ...(request.headers ?? {}) }, signal: controller.signal,
      });
      if (!response.ok) throw new Error(`source_http_${response.status}`);
      const contentLength = Number(response.headers.get("content-length") ?? "0");
      if (contentLength > maxBytes) throw new Error("source_response_too_large");
      const text = await readTextWithLimit(response, maxBytes);
      const headers: Record<string, string> = {};
      response.headers.forEach((value, key) => { headers[key] = value; });
      return { url: url.toString(), status: response.status, fetchedAt: Date.now(), headers, data: text, contentHash: await stableHash({ url: url.toString(), data: text }) };
    } catch (error) {
      if (controller.signal.aborted) throw new Error("source_fetch_timeout");
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
}

export interface SourceEvidenceIngestOptions {
  evidenceType: string;
  subjectId: string;
  claim: string;
  confidence: number;
  eventTs: number;
  publishedTs?: number | null;
  availableTs?: number | null;
  provenance?: Record<string, unknown>;
  evidenceId?: string;
}

export class SourceEvidenceIngestor {
  private readonly evidence: EvidenceStore;
  private readonly source: SourceAdapter;

  constructor(evidence: EvidenceStore, source: SourceAdapter) {
    this.evidence = evidence;
    this.source = source;
  }

  async ingestJson<T = unknown>(request: SourceFetchRequest, options: SourceEvidenceIngestOptions): Promise<{ inserted: boolean; packet: TradingEvidencePacket<T>; fetch: SourceFetchResult<T> }> {
    const fetched = await this.source.fetch(request) as SourceFetchResult<T>;
    const packet = await buildEvidencePacket<T>({
      evidenceId: options.evidenceId ?? `${this.source.id}:${options.subjectId}:${options.eventTs}:${fetched.contentHash ?? 'nohash'}`,
      subjectId: options.subjectId,
      evidenceType: options.evidenceType,
      claim: options.claim,
      confidence: options.confidence,
      source: this.source.id,
      eventTs: options.eventTs,
      publishedTs: options.publishedTs ?? null,
      availableTs: options.availableTs ?? options.publishedTs ?? options.eventTs,
      retrievedTs: fetched.fetchedAt,
      payload: fetched.data,
      provenance: {
        ...(options.provenance ?? {}),
        adapterId: this.source.id,
        sourceUrl: fetched.url,
        httpStatus: fetched.status,
        responseHeaders: fetched.headers,
      },
    });
    const stored = await this.evidence.append(packet);
    return { inserted: stored.inserted, packet: stored.packet as TradingEvidencePacket<T>, fetch: fetched };
  }
}


export class SourceEvidencePipeline {
  private readonly ingestor: SourceEvidenceIngestor;
  private readonly fanout: EvidenceFanoutService;

  constructor(input: {
    evidence: EvidenceStore;
    source: SourceAdapter;
    fanout: EvidenceFanoutService;
  }) {
    this.ingestor = new SourceEvidenceIngestor(input.evidence, input.source);
    this.fanout = input.fanout;
  }

  async ingestAndFanout<T = unknown>(
    request: SourceFetchRequest,
    options: SourceEvidenceIngestOptions,
    fanoutOptions?: EvidenceFanoutOptions,
  ): Promise<{ inserted: boolean; packet: TradingEvidencePacket<T>; workerIds: string[]; tasks: import("../runtime/task-queue.ts").TradingTask[] }> {
    const ingested = await this.ingestor.ingestJson<T>(request, options);
    const routed = await this.fanout.publish(ingested.packet, fanoutOptions);
    return { inserted: ingested.inserted, packet: ingested.packet, workerIds: routed.workerIds, tasks: routed.tasks };
  }
}

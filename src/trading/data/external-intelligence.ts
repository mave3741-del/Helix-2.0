import { validatePointInTime } from '../point-in-time.ts';

export type ExternalIntelligenceType = 'news' | 'social' | 'filing' | 'macro';
export type SentimentLabel = 'very-negative' | 'negative' | 'neutral' | 'positive' | 'very-positive';

export interface ExternalIntelligenceEvidence {
  sourceId: string;
  sourceType: ExternalIntelligenceType;
  subjectId: string;
  canonicalUrl?: string;
  title?: string;
  text?: string;
  eventTs: number;
  publishedTs?: number;
  availableTs: number;
  retrievedTs: number;
  language?: string;
  symbols?: string[];
  entities?: string[];
  sentimentScore?: number;
  sentimentLabel?: SentimentLabel;
  credibilityScore: number;
  manipulationRisk: number;
  duplicateKey: string;
  provenance: Record<string, unknown>;
}

export interface ExternalIntelligenceBatch {
  source: string;
  sourceType: ExternalIntelligenceType;
  adapterId?: string;
  endpoint?: string;
  asOfTs: number;
  observations: ExternalIntelligenceEvidence[];
  rejected: Array<{ subjectId: string; eventTs: number; reasons: string[] }>;
}

export interface ExternalIntelligenceSourceManifest {
  sourceId: string;
  adapterIds: string[];
  allowedHosts: string[];
  name: string;
  sourceType: ExternalIntelligenceType;
  official: boolean;
  apiKeyRequired: boolean;
  pointInTimeSafe: boolean;
  redistributionReviewRequired: boolean;
  maxFreshnessMs?: number;
  notes: string;
}

export function getExternalSourceManifest(sourceId: string): ExternalIntelligenceSourceManifest | null {
  return GOVERNED_EXTERNAL_SOURCE_CATALOG.find((source) => source.sourceId === sourceId) ?? null;
}

export function assertGovernedExternalSource(sourceId: string): ExternalIntelligenceSourceManifest {
  const manifest = getExternalSourceManifest(sourceId);
  if (!manifest) throw new Error(`external_source_not_governed:${sourceId}`);
  return manifest;
}

export function assertAdapterAdmitted(sourceId: string, adapterId: string, endpoint?: string): ExternalIntelligenceSourceManifest {
  const manifest = assertGovernedExternalSource(sourceId);
  if (!adapterId.trim()) throw new Error('external_adapter_id_required');
  if (!manifest.adapterIds.includes(adapterId)) throw new Error(`external_adapter_not_admitted:${sourceId}:${adapterId}`);
  if (endpoint) {
    if (manifest.allowedHosts.length === 0) throw new Error(`external_source_endpoint_not_constrained:${sourceId}`);
    const host = new URL(endpoint).hostname.toLowerCase();
    if (!manifest.allowedHosts.includes(host)) throw new Error(`external_source_host_not_admitted:${sourceId}:${host}`);
  }
  return manifest;
}

export const GOVERNED_EXTERNAL_SOURCE_CATALOG: ExternalIntelligenceSourceManifest[] = [
  { sourceId: 'sec.edgar', adapterIds: ['sec.edgar', 'sec.edgar.submissions'], allowedHosts: ['data.sec.gov'], name: 'SEC EDGAR', sourceType: 'filing', official: true, apiKeyRequired: false, pointInTimeSafe: true, redistributionReviewRequired: true, maxFreshnessMs: 86_400_000, notes: 'Official filings and filing metadata; preserve accession and acceptance timestamps.' },
  { sourceId: 'fred.alfred', adapterIds: ['fred.series.observations'], allowedHosts: ['api.stlouisfed.org'], name: 'FRED/ALFRED', sourceType: 'macro', official: true, apiKeyRequired: true, pointInTimeSafe: true, redistributionReviewRequired: true, maxFreshnessMs: 86_400_000, notes: 'Point-in-time macro vintages; never substitute revised data into historical tests.' },
  { sourceId: 'news.rss', adapterIds: ['news.rss'], allowedHosts: [], name: 'Publisher RSS', sourceType: 'news', official: false, apiKeyRequired: false, pointInTimeSafe: true, redistributionReviewRequired: true, notes: 'Publisher terms and robots/licensing require review before production reuse.' },
  { sourceId: 'x.api', adapterIds: ['x.api'], allowedHosts: ['api.x.com'], name: 'X API', sourceType: 'social', official: false, apiKeyRequired: true, pointInTimeSafe: true, redistributionReviewRequired: true, maxFreshnessMs: 300_000, notes: 'Social posts are unverified signals; retain author/post timestamps and manipulation-risk fields.' },
  { sourceId: 'reddit.api', adapterIds: ['reddit.api'], allowedHosts: ['oauth.reddit.com', 'www.reddit.com'], name: 'Reddit API', sourceType: 'social', official: false, apiKeyRequired: true, pointInTimeSafe: true, redistributionReviewRequired: true, maxFreshnessMs: 600_000, notes: 'Community activity is a corroborating signal, not an autonomous trade command.' },
  { sourceId: 'stocktwits.api', adapterIds: ['stocktwits.api'], allowedHosts: ['api.stocktwits.com'], name: 'Stocktwits API', sourceType: 'social', official: false, apiKeyRequired: true, pointInTimeSafe: true, redistributionReviewRequired: true, maxFreshnessMs: 300_000, notes: 'Crowd sentiment is weighted by source credibility and manipulation risk.' },
];

function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${stableJson(object[key])}`).join(',')}}`;
}

// Pure-JS synchronous SHA-256 (no "node:crypto"). This module is reachable
// from client bundles — src/trading/sentiment/{x,reddit}.ts import
// assertAdapterAdmitted from here, and both are statically imported into
// src/runtime/tools/server.ts, which the client calls as an RPC. Vite
// externalizes "node:crypto" in the browser build, and merely importing it
// throws at module-evaluation time, crashing hydration. This is a
// deterministic content-fingerprint, not a security boundary, and
// buildDuplicateKey/externalIntelligenceHash are called synchronously
// throughout this codebase, so a sync dependency-free SHA-256 avoids an
// async refactor of every call site. Output format matches node's
// createHash("sha256").digest("hex") (verified byte-for-byte).
const SHA256_K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];
const SHA256_H0 = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];

function rotr(x: number, n: number): number {
  return (x >>> n) | (x << (32 - n));
}

function sha256(value: string): string {
  const bytes = new TextEncoder().encode(value);
  const bitLen = bytes.length * 8;
  const withOne = new Uint8Array(((bytes.length + 9 + 63) >> 6) << 6);
  withOne.set(bytes);
  withOne[bytes.length] = 0x80;
  const view = new DataView(withOne.buffer);
  view.setUint32(withOne.length - 4, bitLen >>> 0, false);
  view.setUint32(withOne.length - 8, Math.floor(bitLen / 0x100000000), false);

  const h = SHA256_H0.slice();
  const w = new Int32Array(64);
  for (let offset = 0; offset < withOne.length; offset += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(offset + i * 4, false);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
    }
    let [a, b, c, d, e, f, g, hh] = h;
    for (let i = 0; i < 64; i++) {
      const s1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (hh + s1 + ch + SHA256_K[i] + w[i]) | 0;
      const s0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (s0 + maj) | 0;
      hh = g; g = f; f = e; e = (d + t1) | 0;
      d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    h[0] = (h[0] + a) | 0; h[1] = (h[1] + b) | 0; h[2] = (h[2] + c) | 0; h[3] = (h[3] + d) | 0;
    h[4] = (h[4] + e) | 0; h[5] = (h[5] + f) | 0; h[6] = (h[6] + g) | 0; h[7] = (h[7] + hh) | 0;
  }
  return h.map((x) => (x >>> 0).toString(16).padStart(8, "0")).join("");
}

export function classifySentiment(score: number): SentimentLabel {
  if (!Number.isFinite(score) || score < -1 || score > 1) throw new Error('sentiment_score_out_of_range');
  if (score <= -0.6) return 'very-negative';
  if (score <= -0.2) return 'negative';
  if (score < 0.2) return 'neutral';
  if (score < 0.6) return 'positive';
  return 'very-positive';
}

export function buildDuplicateKey(input: Pick<ExternalIntelligenceEvidence, 'sourceId' | 'subjectId' | 'eventTs' | 'canonicalUrl' | 'title' | 'text'>): string {
  return sha256(stableJson({
    sourceId: input.sourceId,
    subjectId: input.subjectId,
    eventTs: input.eventTs,
    canonicalUrl: input.canonicalUrl ?? '',
    title: input.title ?? '',
    text: input.text ?? '',
  }));
}

export function createExternalIntelligenceEvidence(input: {
  sourceId: string;
  sourceType: ExternalIntelligenceType;
  subjectId: string;
  canonicalUrl?: string;
  title?: string;
  text?: string;
  eventTs: number;
  publishedTs?: number;
  availableTs: number;
  retrievedTs: number;
  language?: string;
  symbols?: string[];
  entities?: string[];
  sentimentScore?: number;
  credibilityScore: number;
  manipulationRisk?: number;
  provenance: Record<string, unknown>;
}, asOfTs: number): ExternalIntelligenceEvidence {
  if (!input.sourceId.trim()) throw new Error('source_id_required');
  assertGovernedExternalSource(input.sourceId);
  if (!input.subjectId.trim()) throw new Error('subject_id_required');
  if (!Number.isFinite(input.credibilityScore) || input.credibilityScore < 0 || input.credibilityScore > 1) throw new Error('credibility_score_out_of_range');
  const manipulationRisk = input.manipulationRisk ?? 0;
  if (!Number.isFinite(manipulationRisk) || manipulationRisk < 0 || manipulationRisk > 1) throw new Error('manipulation_risk_out_of_range');
  if (input.sentimentScore !== undefined) classifySentiment(input.sentimentScore);
  const pit = validatePointInTime({ eventTs: input.eventTs, publishedTs: input.publishedTs ?? input.eventTs, availableTs: input.availableTs }, asOfTs);
  if (!pit.ok) throw new Error(`point_in_time_invalid:${pit.reasons.join('|')}`);
  return {
    ...input,
    symbols: [...new Set(input.symbols ?? [])].sort(),
    entities: [...new Set(input.entities ?? [])].sort(),
    sentimentLabel: input.sentimentScore === undefined ? undefined : classifySentiment(input.sentimentScore),
    manipulationRisk,
    duplicateKey: buildDuplicateKey(input),
  };
}

export function corroborationScore(items: readonly ExternalIntelligenceEvidence[]): number {
  const uniqueSources = new Set(items.map((item) => item.sourceId)).size;
  if (items.length === 0) return 0;
  const avgCredibility = items.reduce((sum, item) => sum + item.credibilityScore, 0) / items.length;
  const avgRisk = items.reduce((sum, item) => sum + item.manipulationRisk, 0) / items.length;
  const sourceBonus = Math.min(1, uniqueSources / 4);
  return Math.max(0, Math.min(1, avgCredibility * 0.5 + sourceBonus * 0.3 + (1 - avgRisk) * 0.2));
}

export interface GovernedExternalIntelligenceResult {
  accepted: ExternalIntelligenceEvidence[];
  duplicates: ExternalIntelligenceEvidence[];
  rejected: ExternalIntelligenceBatch['rejected'];
  corroboration: number;
  tradeDirectiveAllowed: false;
}

export function governExternalIntelligence(batch: ExternalIntelligenceBatch): GovernedExternalIntelligenceResult {
  const manifest = assertGovernedExternalSource(batch.source);
  if (batch.sourceType !== manifest.sourceType) throw new Error(`external_source_type_mismatch:${batch.source}`);
  if (batch.adapterId !== undefined) assertAdapterAdmitted(batch.source, batch.adapterId, batch.endpoint);
  const seen = new Set<string>();
  const accepted: ExternalIntelligenceEvidence[] = [];
  const duplicates: ExternalIntelligenceEvidence[] = [];
  const rejected = [...batch.rejected];
  for (const item of batch.observations) {
    if (item.sourceId !== batch.source) throw new Error(`external_observation_source_mismatch:${item.sourceId}`);
    if (item.sourceType !== batch.sourceType) throw new Error(`external_observation_type_mismatch:${item.sourceId}`);
    if (batch.adapterId !== undefined && item.provenance.adapterId !== batch.adapterId) {
      throw new Error(`external_observation_adapter_mismatch:${item.sourceId}`);
    }
    const expectedDuplicateKey = buildDuplicateKey(item);
    if (item.duplicateKey !== expectedDuplicateKey) throw new Error(`external_duplicate_key_mismatch:${item.sourceId}`);
    if (seen.has(item.duplicateKey)) {
      duplicates.push(item);
      continue;
    }
    seen.add(item.duplicateKey);
    accepted.push(item);
  }
  return { accepted, duplicates, rejected, corroboration: corroborationScore(accepted), tradeDirectiveAllowed: false };
}

export function externalIntelligenceHash(batch: ExternalIntelligenceBatch): string {
  return sha256(stableJson(batch));
}

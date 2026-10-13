import { validatePointInTime } from './point-in-time.ts';
import { stableHash } from './runtime/task-results.ts';
import type { PointInTimeBatch, PointInTimeObservation } from './data/source-specific.ts';

export type SmartMoneySource = 'onchain' | 'institutional-13f' | 'futures-cot';
export type SmartMoneyAction = 'inflow' | 'outflow' | 'transfer' | 'position';

export interface SmartMoneyEntity {
  entityId: string;
  label: string;
  confidence: number;
  method: 'explicit' | 'cluster' | 'heuristic' | 'unknown';
}

export interface SmartMoneyObservation {
  source: SmartMoneySource;
  entity: SmartMoneyEntity | null;
  asset: string;
  action: SmartMoneyAction;
  notionalUsd?: number;
  quantity?: number;
  direction?: 'long' | 'short' | 'neutral';
  from?: string | null;
  to?: string | null;
  eventTs: number;
  publishedTs: number;
  availableTs: number;
  asOfTs: number;
  provenance: Record<string, unknown>;
  payload: Record<string, unknown>;
}

export interface SmartMoneyContext {
  asset: string;
  observations: SmartMoneyObservation[];
  corroborationScore: number;
  opposingScore: number;
  entityCount: number;
  historicalSamples: number;
  tradeSignal: 'none';
}

export interface OnChainTransferInput {
  txHash: string;
  asset: string;
  amount: number;
  notionalUsd?: number;
  from: string;
  to: string;
  blockTs: number;
  publishedTs?: number;
  availableTs?: number;
  entity?: SmartMoneyEntity | null;
  source: string;
  retrievedTs: number;
}

export interface Institutional13FHoldingInput {
  filerId: string;
  filerName?: string;
  issuer: string;
  cusip?: string;
  shares: number;
  valueUsd?: number;
  reportPeriod: number;
  filedAt: number;
  source: string;
  retrievedTs: number;
  entity?: SmartMoneyEntity | null;
}

export interface CftcPositioningInput {
  market: string;
  reportDate: number;
  publishedTs: number;
  availableTs: number;
  long: number;
  short: number;
  openInterest?: number;
  category: string;
  source: string;
  retrievedTs: number;
}

function finite(value: unknown, name: string): number {
  const n = Number(value);
  if (!Number.isFinite(n)) throw new Error(`invalid_${name}`);
  return n;
}

function normalizeEntity(entity: SmartMoneyEntity | null | undefined): SmartMoneyEntity | null {
  if (!entity) return null;
  const confidence = Math.max(0, Math.min(1, finite(entity.confidence, 'entity_confidence')));
  return { ...entity, confidence };
}

export function normalizeOnChainTransfers(input: OnChainTransferInput, asOfTs = Date.now()): PointInTimeBatch<SmartMoneyObservation> {
  const eventTs = finite(input.blockTs, 'block_ts');
  const publishedTs = input.publishedTs ?? eventTs;
  // A block timestamp is the event time, not the time Helix can observe the transfer.
  // When an upstream feed does not provide its own availability timestamp, the safe
  // default is the actual retrieval time so historical queries cannot see the row early.
  const availableTs = input.availableTs ?? input.retrievedTs;
  const pit = validatePointInTime({ eventTs, publishedTs, availableTs }, asOfTs);
  if (!pit.ok) return { source: input.source, asOfTs, observations: [], rejected: [{ subjectId: input.txHash, eventTs, reasons: pit.reasons }] };
  const direction = input.from && input.to ? 'transfer' : 'inflow';
  const value: SmartMoneyObservation = {
    source: 'onchain', entity: normalizeEntity(input.entity), asset: input.asset, action: direction,
    notionalUsd: input.notionalUsd, quantity: finite(input.amount, 'amount'), from: input.from, to: input.to,
    eventTs, publishedTs, availableTs, asOfTs, provenance: { source: input.source, txHash: input.txHash, retrievedTs: input.retrievedTs },
    payload: { txHash: input.txHash, from: input.from, to: input.to, amount: input.amount },
  };
  return { source: input.source, asOfTs, observations: [{ subjectId: input.asset, eventTs, publishedTs, availableTs, value, provenance: value.provenance }], rejected: [] };
}

export function normalize13FHolding(input: Institutional13FHoldingInput, asOfTs = Date.now()): PointInTimeBatch<SmartMoneyObservation> {
  const eventTs = finite(input.reportPeriod, 'report_period');
  const publishedTs = finite(input.filedAt, 'filed_at');
  const availableTs = publishedTs;
  const pit = validatePointInTime({ eventTs, publishedTs, availableTs }, asOfTs);
  if (!pit.ok) return { source: input.source, asOfTs, observations: [], rejected: [{ subjectId: input.issuer, eventTs, reasons: pit.reasons }] };
  const value: SmartMoneyObservation = {
    source: 'institutional-13f', entity: normalizeEntity(input.entity ?? { entityId: input.filerId, label: input.filerName ?? input.filerId, confidence: 1, method: 'explicit' }),
    asset: input.issuer, action: 'position', quantity: finite(input.shares, 'shares'), notionalUsd: input.valueUsd,
    direction: 'neutral', eventTs, publishedTs, availableTs, asOfTs,
    provenance: { source: input.source, filerId: input.filerId, cusip: input.cusip ?? null, retrievedTs: input.retrievedTs },
    payload: { issuer: input.issuer, filerId: input.filerId, shares: input.shares, valueUsd: input.valueUsd ?? null },
  };
  return { source: input.source, asOfTs, observations: [{ subjectId: input.issuer, eventTs, publishedTs, availableTs, value, provenance: value.provenance }], rejected: [] };
}

export function normalizeCftcPositioning(input: CftcPositioningInput, asOfTs = Date.now()): PointInTimeBatch<SmartMoneyObservation> {
  const eventTs = finite(input.reportDate, 'report_date');
  const publishedTs = finite(input.publishedTs, 'published_ts');
  const availableTs = finite(input.availableTs, 'available_ts');
  const pit = validatePointInTime({ eventTs, publishedTs, availableTs }, asOfTs);
  if (!pit.ok) return { source: input.source, asOfTs, observations: [], rejected: [{ subjectId: input.market, eventTs, reasons: pit.reasons }] };
  const direction = input.long === input.short ? 'neutral' : input.long > input.short ? 'long' : 'short';
  const value: SmartMoneyObservation = {
    source: 'futures-cot', entity: { entityId: input.category, label: input.category, confidence: 1, method: 'explicit' },
    asset: input.market, action: 'position', direction, eventTs, publishedTs, availableTs, asOfTs,
    provenance: { source: input.source, category: input.category, retrievedTs: input.retrievedTs },
    payload: { market: input.market, long: input.long, short: input.short, net: input.long - input.short, openInterest: input.openInterest ?? null },
  };
  return { source: input.source, asOfTs, observations: [{ subjectId: input.market, eventTs, publishedTs, availableTs, value, provenance: value.provenance }], rejected: [] };
}

export function buildSmartMoneyContext(asset: string, observations: SmartMoneyObservation[]): SmartMoneyContext {
  const relevant = observations.filter((item) => item.asset === asset).sort((a, b) => a.eventTs - b.eventTs);
  const latestByEntity = new Map<string, SmartMoneyObservation>();
  for (const item of relevant) {
    const id = item.entity?.entityId ?? `${item.source}:${item.asset}`;
    latestByEntity.set(id, item);
  }
  let corroborationScore = 0;
  let opposingScore = 0;
  for (const item of latestByEntity.values()) {
    const weight = item.entity?.confidence ?? 0.5;
    if (item.direction === 'long' || item.action === 'inflow') corroborationScore += weight;
    if (item.direction === 'short' || item.action === 'outflow') opposingScore += weight;
  }
  const total = corroborationScore + opposingScore || 1;
  return {
    asset, observations: relevant, corroborationScore: corroborationScore / total, opposingScore: opposingScore / total,
    entityCount: latestByEntity.size, historicalSamples: relevant.length, tradeSignal: 'none',
  };
}

export async function smartMoneyObservationId(observation: SmartMoneyObservation): Promise<string> {
  return `smart-money:${observation.source}:${observation.asset}:${observation.eventTs}:${observation.publishedTs}:${observation.availableTs}:${(await stableHash(observation.payload)).slice(0, 24)}`;
}

export interface SmartMoneyEvidenceBridge {
  ingestBatch<T>(batch: PointInTimeBatch<T>, options: {
    evidenceType: string;
    claim: (observation: PointInTimeObservation<T>) => string;
    confidence?: number | ((observation: PointInTimeObservation<T>) => number);
    sourceTier?: number;
    requiredProvenance?: string[];
    evidenceIdPrefix?: string;
  }): Promise<unknown>;
}

export async function ingestSmartMoneyAsEvidence(
  bridge: SmartMoneyEvidenceBridge,
  batch: PointInTimeBatch<SmartMoneyObservation>,
): Promise<unknown> {
  return bridge.ingestBatch(batch, {
    evidenceType: 'smart-money',
    evidenceIdPrefix: 'smart-money',
    sourceTier: 2,
    requiredProvenance: ['source'],
    claim: (observation) => {
      const value = observation.value;
      const actor = value.entity?.label ?? 'unattributed participant';
      const direction = value.direction ?? value.action;
      return `${actor} produced a public ${value.source} observation for ${value.asset}: ${direction}. This is contextual evidence, not an automatic trade instruction.`;
    },
    confidence: (observation) => Math.max(0, Math.min(1, (observation.value.entity?.confidence ?? 0.5) * 0.9)),
  });
}

import { createHash } from 'node:crypto';
import type { BrokerConnector, BrokerMarket, BrokerOrder, BrokerOrderRequest } from './broker-connectors.ts';

export type VenueAssetClass = 'crypto' | 'us_equity' | 'fx' | 'commodities' | 'futures' | 'options';
export type VenueAdapterStatus = 'proposed' | 'assessed' | 'approved' | 'deployed' | 'rejected' | 'retired';
export type VenueExecutionMode = 'paper' | 'live';

export interface VenueAdapterCapabilities {
  marketData: boolean;
  orderEntry: boolean;
  account: boolean;
  positions: boolean;
  orderCancellation: boolean;
  websocket: boolean;
  rest: boolean;
  assetClasses: readonly VenueAssetClass[];
}

export interface VenueAdapterEvidence {
  licenseReviewed: boolean;
  dataRightsReviewed: boolean;
  securityReviewed: boolean;
  testsVerified: boolean;
  latencyReviewed: boolean;
  provenanceVerified: boolean;
  reproducibilityVerified: boolean;
  credentialIsolationVerified: boolean;
  endpointAllowlistVerified: boolean;
  normalizationVerified: boolean;
  replaySafetyVerified: boolean;
  killSwitchVerified: boolean;
}

export interface VenueAdapterRecord {
  id: string;
  venueId: string;
  sourceRepository?: string;
  sourceVersion?: string;
  adapterVersion: string;
  capability: string;
  implementationKind: 'native' | 'adapter' | 'reference' | 'reimplementation';
  status: VenueAdapterStatus;
  executionModes: readonly VenueExecutionMode[];
  liveExecutionEnabled: boolean;
  capabilities: VenueAdapterCapabilities;
  evidence: VenueAdapterEvidence;
  provenance: string;
  implementationHash: string;
  evidenceHash: string;
  updatedAt: number;
}

export interface VenueTicker {
  venueId: string;
  symbol: string;
  bid?: number;
  ask?: number;
  last?: number;
  volume24h?: number;
  exchangeTimestamp: number;
  receivedAt: number;
  sequence?: number;
  sourceEventId: string;
}

export interface VenueAdapter {
  readonly manifest: VenueAdapterRecord;
  ticker(symbol: string): Promise<VenueTicker>;
  markets(query?: { assetClasses?: VenueAssetClass[]; symbols?: string[] }): Promise<BrokerMarket[]>;
  placePaperOrder?(order: BrokerOrderRequest): Promise<BrokerOrder>;
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${stableJson(object[key])}`).join(',')}}`;
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function allEvidencePassed(evidence: VenueAdapterEvidence): boolean {
  return Object.values(evidence).every(Boolean);
}

export function venueAdapterEvidenceHash(evidence: VenueAdapterEvidence): string {
  return sha256(stableJson(evidence));
}

export function createVenueAdapterRecord(input: {
  venueId: string;
  adapterVersion: string;
  sourceRepository?: string;
  sourceVersion?: string;
  capability: string;
  implementationKind: VenueAdapterRecord['implementationKind'];
  executionModes?: VenueExecutionMode[];
  liveExecutionEnabled?: boolean;
  capabilities: VenueAdapterCapabilities;
  evidence?: Partial<VenueAdapterEvidence>;
  provenance: string;
}): VenueAdapterRecord {
  if (!input.venueId.trim()) throw new Error('venue_id_required');
  if (!input.adapterVersion.trim()) throw new Error('adapter_version_required');
  if (!input.capability.trim()) throw new Error('capability_required');
  if (!input.provenance.trim()) throw new Error('provenance_required');
  if (input.liveExecutionEnabled === true) throw new Error('live_execution_is_globally_disabled');
  if ((input.executionModes ?? ['paper']).includes('live')) throw new Error('live_execution_mode_is_not_admitted');
  if (!input.capabilities.marketData && !input.capabilities.orderEntry) throw new Error('venue_adapter_requires_market_data_or_order_entry');
  if (input.capabilities.assetClasses.length === 0) throw new Error('venue_asset_class_required');

  const evidence: VenueAdapterEvidence = {
    licenseReviewed: false,
    dataRightsReviewed: false,
    securityReviewed: false,
    testsVerified: false,
    latencyReviewed: false,
    provenanceVerified: false,
    reproducibilityVerified: false,
    credentialIsolationVerified: false,
    endpointAllowlistVerified: false,
    normalizationVerified: false,
    replaySafetyVerified: false,
    killSwitchVerified: false,
    ...input.evidence,
  };
  const base = {
    id: `venue:${input.venueId}:${input.adapterVersion}`,
    venueId: input.venueId,
    ...(input.sourceRepository ? { sourceRepository: input.sourceRepository } : {}),
    ...(input.sourceVersion ? { sourceVersion: input.sourceVersion } : {}),
    adapterVersion: input.adapterVersion,
    capability: input.capability,
    implementationKind: input.implementationKind,
    status: 'proposed' as const,
    executionModes: ['paper'] as VenueExecutionMode[],
    liveExecutionEnabled: false,
    capabilities: {
      ...input.capabilities,
      assetClasses: [...input.capabilities.assetClasses].sort(),
    },
    evidence,
    provenance: input.provenance,
  };
  return {
    ...base,
    implementationHash: sha256(stableJson(base)),
    evidenceHash: venueAdapterEvidenceHash(evidence),
    updatedAt: Date.now(),
  };
}

export function assessVenueAdapter(record: VenueAdapterRecord): VenueAdapterRecord {
  if (record.liveExecutionEnabled) throw new Error('live_execution_is_globally_disabled');
  if (!record.executionModes.includes('paper') || record.executionModes.includes('live')) throw new Error('paper_only_execution_required');
  if (!record.evidence.licenseReviewed) throw new Error('license_review_required');
  if (!record.evidence.dataRightsReviewed) throw new Error('data_rights_review_required');
  if (!record.evidence.securityReviewed) throw new Error('security_review_required');
  if (!record.evidence.provenanceVerified) throw new Error('provenance_verification_required');
  if (!record.evidence.credentialIsolationVerified) throw new Error('credential_isolation_review_required');
  if (!record.evidence.endpointAllowlistVerified) throw new Error('endpoint_allowlist_review_required');
  if (!record.evidence.normalizationVerified) throw new Error('normalization_review_required');
  if (!record.evidence.replaySafetyVerified) throw new Error('replay_safety_review_required');
  if (!record.evidence.killSwitchVerified) throw new Error('kill_switch_review_required');
  if ((record.capabilities.marketData || record.capabilities.orderEntry) && !record.evidence.latencyReviewed) throw new Error('latency_review_required');
  return { ...record, status: 'assessed', evidenceHash: venueAdapterEvidenceHash(record.evidence), updatedAt: Date.now() };
}

export function approveVenueAdapter(record: VenueAdapterRecord): VenueAdapterRecord {
  if (record.status !== 'assessed') throw new Error(`invalid_status_for_approval:${record.status}`);
  if (!allEvidencePassed(record.evidence)) throw new Error('all_venue_adapter_evidence_required');
  return { ...record, status: 'approved', updatedAt: Date.now() };
}

export function deployVenueAdapter(record: VenueAdapterRecord): VenueAdapterRecord {
  if (record.status !== 'approved') throw new Error(`invalid_status_for_deployment:${record.status}`);
  if (!allEvidencePassed(record.evidence)) throw new Error('deployment_requires_complete_evidence');
  if (record.liveExecutionEnabled || record.executionModes.includes('live')) throw new Error('live_execution_is_globally_disabled');
  return { ...record, status: 'deployed', executionModes: ['paper'], liveExecutionEnabled: false, updatedAt: Date.now() };
}

export function canEnterVenuePaperPath(record: VenueAdapterRecord): boolean {
  return record.status === 'deployed'
    && record.executionModes.length === 1
    && record.executionModes[0] === 'paper'
    && record.liveExecutionEnabled === false
    && record.capabilities.assetClasses.length > 0
    && allEvidencePassed(record.evidence);
}

export function createBrokerBackedPaperVenueAdapter(
  manifest: VenueAdapterRecord,
  connector: BrokerConnector,
): VenueAdapter {
  if (connector.mode !== 'paper') throw new Error('paper_connector_required');
  if (!canEnterVenuePaperPath(manifest)) throw new Error('venue_adapter_not_admitted_for_paper_path');
  return {
    manifest,
    async ticker(symbol) {
      if (!symbol.trim()) throw new Error('symbol_required');
      const rows = await connector.orders({ symbol, status: 'all', limit: 1 });
      const exchangeTimestamp = rows[0]?.submittedAt ?? Date.now();
      return {
        venueId: manifest.venueId,
        symbol,
        exchangeTimestamp,
        receivedAt: Date.now(),
        sourceEventId: sha256(stableJson({ venueId: manifest.venueId, symbol, exchangeTimestamp })),
      };
    },
    async markets(query = {}) {
      const rows = await connector.markets({
        assetClass: query.assetClasses?.length === 1 ? query.assetClasses[0] as BrokerMarket['assetClass'] : undefined,
        symbols: query.symbols,
      });
      return rows;
    },
    async placePaperOrder(order) {
      return connector.placeOrder(order);
    },
  };
}

import { createHash } from 'node:crypto';
import type { VenueAdapterRecord } from '../execution/venue-adapter.ts';

export type CryptoStrategyKind = 'market-making' | 'arbitrage' | 'trend' | 'mean-reversion';
export type CryptoResearchMode = 'dry-run' | 'paper';
export type CryptoOptimizationMode = 'bounded-grid' | 'bounded-random' | 'none';

export interface CryptoStrategyEvidence {
  licenseReviewed: boolean;
  dataRightsReviewed: boolean;
  securityReviewed: boolean;
  testsVerified: boolean;
  latencyReviewed: boolean;
  provenanceVerified: boolean;
  reproducibilityVerified: boolean;
  venueAdmissionVerified: boolean;
  paperExecutionVerified: boolean;
  costModelVerified: boolean;
  slippageModelVerified: boolean;
  walkForwardVerified: boolean;
  overfitControlsVerified: boolean;
}

export interface CryptoStrategyParameterBounds {
  name: string;
  min: number;
  max: number;
  step: number;
}

export interface CryptoStrategyCapabilityRecord {
  id: string;
  strategyId: string;
  strategyKind: CryptoStrategyKind;
  researchMode: CryptoResearchMode;
  optimizationMode: CryptoOptimizationMode;
  venueAdapterIds: string[];
  symbols: string[];
  parameterBounds: CryptoStrategyParameterBounds[];
  maxConcurrentPositions: number;
  maxNotionalPerPosition: number;
  maxDailyLoss: number;
  liveExecutionEnabled: false;
  status: 'proposed' | 'assessed' | 'approved' | 'deployed' | 'retired' | 'rejected';
  evidence: CryptoStrategyEvidence;
  provenance: string;
  implementationHash: string;
  evidenceHash: string;
  updatedAt: number;
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

function allEvidencePassed(evidence: CryptoStrategyEvidence): boolean {
  return Object.values(evidence).every(Boolean);
}

function validateBounds(bounds: CryptoStrategyParameterBounds[]): void {
  for (const bound of bounds) {
    if (!bound.name.trim()) throw new Error('parameter_name_required');
    if (![bound.min, bound.max, bound.step].every(Number.isFinite)) throw new Error('parameter_bounds_must_be_finite');
    if (bound.min < 0 || bound.max < bound.min || bound.step <= 0) throw new Error('invalid_parameter_bounds');
  }
}

export function cryptoStrategyEvidenceHash(evidence: CryptoStrategyEvidence): string {
  return sha256(stableJson(evidence));
}

export function cryptoStrategyCapabilityHash(
  record: Omit<CryptoStrategyCapabilityRecord, 'updatedAt' | 'implementationHash' | 'evidenceHash'>,
): string {
  return sha256(stableJson(record));
}

export function createCryptoStrategyCapabilityRecord(input: {
  strategyId: string;
  strategyKind: CryptoStrategyKind;
  researchMode?: CryptoResearchMode;
  optimizationMode?: CryptoOptimizationMode;
  venueAdapters: VenueAdapterRecord[];
  symbols: string[];
  parameterBounds?: CryptoStrategyParameterBounds[];
  maxConcurrentPositions?: number;
  maxNotionalPerPosition?: number;
  maxDailyLoss?: number;
  evidence?: Partial<CryptoStrategyEvidence>;
  provenance: string;
  implementationHash?: string;
}): CryptoStrategyCapabilityRecord {
  if (!input.strategyId.trim()) throw new Error('strategy_id_required');
  if (!input.provenance.trim()) throw new Error('provenance_required');
  if (input.symbols.length === 0) throw new Error('crypto_symbol_required');
  if (input.symbols.some((symbol) => !symbol.trim())) throw new Error('crypto_symbol_invalid');
  if (input.venueAdapters.length === 0) throw new Error('venue_adapter_required');
  if (input.venueAdapters.some((adapter) => adapter.liveExecutionEnabled || !adapter.executionModes.includes('paper') || adapter.executionModes.includes('live'))) {
    throw new Error('paper_only_venue_admission_required');
  }

  const parameterBounds = [...(input.parameterBounds ?? [])]
    .map((bound) => ({ ...bound }))
    .sort((a, b) => a.name.localeCompare(b.name));
  validateBounds(parameterBounds);

  const maxConcurrentPositions = input.maxConcurrentPositions ?? 1;
  const maxNotionalPerPosition = input.maxNotionalPerPosition ?? 0;
  const maxDailyLoss = input.maxDailyLoss ?? 0;
  if (!Number.isInteger(maxConcurrentPositions) || maxConcurrentPositions <= 0) throw new Error('invalid_max_concurrent_positions');
  if (!Number.isFinite(maxNotionalPerPosition) || maxNotionalPerPosition <= 0) throw new Error('invalid_max_notional_per_position');
  if (!Number.isFinite(maxDailyLoss) || maxDailyLoss <= 0) throw new Error('invalid_max_daily_loss');

  const evidence: CryptoStrategyEvidence = {
    licenseReviewed: false,
    dataRightsReviewed: false,
    securityReviewed: false,
    testsVerified: false,
    latencyReviewed: false,
    provenanceVerified: false,
    reproducibilityVerified: false,
    venueAdmissionVerified: false,
    paperExecutionVerified: false,
    costModelVerified: false,
    slippageModelVerified: false,
    walkForwardVerified: false,
    overfitControlsVerified: false,
    ...input.evidence,
  };

  const base = {
    id: `crypto-strategy:${input.strategyId}`,
    strategyId: input.strategyId,
    strategyKind: input.strategyKind,
    researchMode: input.researchMode ?? 'paper',
    optimizationMode: input.optimizationMode ?? 'none',
    venueAdapterIds: input.venueAdapters.map((adapter) => adapter.id).sort(),
    symbols: [...new Set(input.symbols.map((symbol) => symbol.trim().toUpperCase()))].sort(),
    parameterBounds,
    maxConcurrentPositions,
    maxNotionalPerPosition,
    maxDailyLoss,
    liveExecutionEnabled: false as const,
    status: 'proposed' as const,
    evidence,
    provenance: input.provenance,
  };

  return {
    ...base,
    implementationHash: input.implementationHash ?? cryptoStrategyCapabilityHash(base),
    evidenceHash: cryptoStrategyEvidenceHash(evidence),
    updatedAt: Date.now(),
  };
}

export function assessCryptoStrategyCapability(
  record: CryptoStrategyCapabilityRecord,
  venueAdapters: VenueAdapterRecord[],
): CryptoStrategyCapabilityRecord {
  if (record.liveExecutionEnabled) throw new Error('live_execution_is_globally_disabled');
  if (record.researchMode !== 'paper' && record.researchMode !== 'dry-run') throw new Error('unsupported_research_mode');
  const admitted = new Set(venueAdapters.filter((adapter) => adapter.status === 'deployed' && !adapter.liveExecutionEnabled && adapter.executionModes.length === 1 && adapter.executionModes[0] === 'paper').map((adapter) => adapter.id));
  if (record.venueAdapterIds.some((id) => !admitted.has(id))) throw new Error('venue_admission_required');
  if (!record.evidence.licenseReviewed) throw new Error('license_review_required');
  if (!record.evidence.dataRightsReviewed) throw new Error('data_rights_review_required');
  if (!record.evidence.securityReviewed) throw new Error('security_review_required');
  if (!record.evidence.provenanceVerified) throw new Error('provenance_verification_required');
  if (!record.evidence.venueAdmissionVerified) throw new Error('venue_admission_evidence_required');
  if (!record.evidence.paperExecutionVerified) throw new Error('paper_execution_review_required');
  if (!record.evidence.costModelVerified) throw new Error('cost_model_review_required');
  if (!record.evidence.slippageModelVerified) throw new Error('slippage_model_review_required');
  if (!record.evidence.walkForwardVerified) throw new Error('walk_forward_review_required');
  if (!record.evidence.overfitControlsVerified) throw new Error('overfit_controls_required');
  if (!record.evidence.testsVerified) throw new Error('strategy_tests_required');
  if (!record.evidence.reproducibilityVerified) throw new Error('reproducibility_verification_required');
  if (record.optimizationMode !== 'none' && !record.evidence.latencyReviewed) throw new Error('optimization_latency_review_required');
  return { ...record, status: 'assessed', evidenceHash: cryptoStrategyEvidenceHash(record.evidence), updatedAt: Date.now() };
}

export function approveCryptoStrategyCapability(record: CryptoStrategyCapabilityRecord): CryptoStrategyCapabilityRecord {
  if (record.status !== 'assessed') throw new Error(`invalid_status_for_approval:${record.status}`);
  if (!allEvidencePassed(record.evidence)) throw new Error('all_crypto_strategy_evidence_required');
  return { ...record, status: 'approved', updatedAt: Date.now() };
}

export function deployCryptoStrategyCapability(record: CryptoStrategyCapabilityRecord): CryptoStrategyCapabilityRecord {
  if (record.status !== 'approved') throw new Error(`invalid_status_for_deployment:${record.status}`);
  if (!allEvidencePassed(record.evidence)) throw new Error('deployment_requires_complete_evidence');
  if (record.liveExecutionEnabled) throw new Error('live_execution_is_globally_disabled');
  return { ...record, status: 'deployed', liveExecutionEnabled: false, updatedAt: Date.now() };
}

export function canRunCryptoPaperStrategy(record: CryptoStrategyCapabilityRecord): boolean {
  return record.status === 'deployed'
    && record.liveExecutionEnabled === false
    && (record.researchMode === 'paper' || record.researchMode === 'dry-run')
    && allEvidencePassed(record.evidence)
    && record.venueAdapterIds.length > 0;
}

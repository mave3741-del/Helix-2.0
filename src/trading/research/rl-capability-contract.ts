import { createHash } from 'node:crypto';

export type RlAlgorithm = 'ppo' | 'sac' | 'td3' | 'a2c' | 'ddpg';
export type RlResearchStage = 'training' | 'validation' | 'out_of_sample' | 'paper';
export type RlStatus = 'proposed' | 'assessed' | 'approved' | 'deployed' | 'retired' | 'rejected';

export interface RlCapabilityEvidence {
  licenseReviewed: boolean;
  dataRightsReviewed: boolean;
  securityReviewed: boolean;
  testsVerified: boolean;
  provenanceVerified: boolean;
  reproducibilityVerified: boolean;
  environmentIntegrityVerified: boolean;
  rewardDesignReviewed: boolean;
  seedStabilityVerified: boolean;
  walkForwardVerified: boolean;
  overfitControlsVerified: boolean;
  paperExecutionVerified: boolean;
}

export interface RlCapabilityRecord {
  id: string;
  capabilityId: string;
  environmentId: string;
  algorithm: RlAlgorithm;
  stage: RlResearchStage;
  observationSpace: { dimensions: number; continuous: boolean };
  actionSpace: { dimensions: number; continuous: boolean; maxMagnitude: number };
  rewardPolicy: { maxStepReward: number; maxEpisodeReward: number; turnoverPenalty: number; drawdownPenalty: number };
  trainEpisodes: number;
  validationEpisodes: number;
  outOfSampleEpisodes: number;
  seeds: number[];
  minValidationReward: number;
  maxDrawdown: number;
  maxTurnover: number;
  minSeedAgreement: number;
  liveExecutionEnabled: false;
  status: RlStatus;
  evidence: RlCapabilityEvidence;
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

function allEvidencePassed(evidence: RlCapabilityEvidence): boolean {
  return Object.values(evidence).every(Boolean);
}

function validateSpace(name: string, space: { dimensions: number; continuous: boolean }): void {
  if (!Number.isInteger(space.dimensions) || space.dimensions <= 0) throw new Error(`${name}_dimensions_invalid`);
  if (typeof space.continuous !== 'boolean') throw new Error(`${name}_continuous_invalid`);
}

function validateRewardPolicy(policy: RlCapabilityRecord['rewardPolicy']): void {
  if (![policy.maxStepReward, policy.maxEpisodeReward, policy.turnoverPenalty, policy.drawdownPenalty].every(Number.isFinite)) {
    throw new Error('reward_policy_must_be_finite');
  }
  if (policy.maxStepReward <= 0 || policy.maxEpisodeReward <= 0 || policy.turnoverPenalty < 0 || policy.drawdownPenalty < 0) {
    throw new Error('reward_policy_invalid');
  }
}

export function rlCapabilityEvidenceHash(evidence: RlCapabilityEvidence): string {
  return sha256(stableJson(evidence));
}

export function rlCapabilityHash(
  record: Omit<RlCapabilityRecord, 'updatedAt' | 'implementationHash' | 'evidenceHash'>,
): string {
  return sha256(stableJson(record));
}

export function createRlCapabilityRecord(input: {
  capabilityId: string;
  environmentId: string;
  algorithm: RlAlgorithm;
  stage?: RlResearchStage;
  observationSpace: RlCapabilityRecord['observationSpace'];
  actionSpace: RlCapabilityRecord['actionSpace'];
  rewardPolicy: RlCapabilityRecord['rewardPolicy'];
  trainEpisodes?: number;
  validationEpisodes?: number;
  outOfSampleEpisodes?: number;
  seeds?: number[];
  minValidationReward?: number;
  maxDrawdown?: number;
  maxTurnover?: number;
  minSeedAgreement?: number;
  evidence?: Partial<RlCapabilityEvidence>;
  provenance: string;
  implementationHash?: string;
}): RlCapabilityRecord {
  if (!input.capabilityId.trim()) throw new Error('rl_capability_id_required');
  if (!input.environmentId.trim()) throw new Error('rl_environment_id_required');
  if (!input.provenance.trim()) throw new Error('rl_provenance_required');
  validateSpace('observation', input.observationSpace);
  validateSpace('action', input.actionSpace);
  if (!Number.isFinite(input.actionSpace.maxMagnitude) || input.actionSpace.maxMagnitude <= 0) throw new Error('action_space_max_magnitude_invalid');
  validateRewardPolicy(input.rewardPolicy);

  const trainEpisodes = input.trainEpisodes ?? 100;
  const validationEpisodes = input.validationEpisodes ?? 30;
  const outOfSampleEpisodes = input.outOfSampleEpisodes ?? 30;
  if (![trainEpisodes, validationEpisodes, outOfSampleEpisodes].every((v) => Number.isInteger(v) && v > 0)) throw new Error('rl_episode_budget_invalid');

  const seeds = [...new Set(input.seeds ?? [1, 2, 3])].sort((a, b) => a - b);
  if (seeds.length < 2 || seeds.some((seed) => !Number.isInteger(seed) || seed < 0)) throw new Error('rl_seed_set_invalid');
  const minValidationReward = input.minValidationReward ?? 0.5;
  const maxDrawdown = input.maxDrawdown ?? 0.25;
  const maxTurnover = input.maxTurnover ?? 1;
  const minSeedAgreement = input.minSeedAgreement ?? 0.67;
  if (![minValidationReward, maxDrawdown, maxTurnover, minSeedAgreement].every(Number.isFinite)) throw new Error('rl_gate_parameters_invalid');
  if (maxDrawdown <= 0 || maxDrawdown > 1 || maxTurnover <= 0 || minSeedAgreement <= 0 || minSeedAgreement > 1) throw new Error('rl_gate_parameters_out_of_range');

  const evidence: RlCapabilityEvidence = {
    licenseReviewed: false,
    dataRightsReviewed: false,
    securityReviewed: false,
    testsVerified: false,
    provenanceVerified: false,
    reproducibilityVerified: false,
    environmentIntegrityVerified: false,
    rewardDesignReviewed: false,
    seedStabilityVerified: false,
    walkForwardVerified: false,
    overfitControlsVerified: false,
    paperExecutionVerified: false,
    ...input.evidence,
  };

  const base: Omit<RlCapabilityRecord, 'updatedAt' | 'implementationHash' | 'evidenceHash'> = {
    id: `rl-capability:${input.capabilityId}`,
    capabilityId: input.capabilityId,
    environmentId: input.environmentId,
    algorithm: input.algorithm,
    stage: input.stage ?? 'training',
    observationSpace: { ...input.observationSpace },
    actionSpace: { ...input.actionSpace },
    rewardPolicy: { ...input.rewardPolicy },
    trainEpisodes,
    validationEpisodes,
    outOfSampleEpisodes,
    seeds,
    minValidationReward,
    maxDrawdown,
    maxTurnover,
    minSeedAgreement,
    liveExecutionEnabled: false,
    status: 'proposed',
    evidence,
    provenance: input.provenance,
  };

  return {
    ...base,
    implementationHash: input.implementationHash ?? rlCapabilityHash(base),
    evidenceHash: rlCapabilityEvidenceHash(evidence),
    updatedAt: Date.now(),
  };
}

export function assessRlCapability(record: RlCapabilityRecord): RlCapabilityRecord {
  if (record.liveExecutionEnabled) throw new Error('live_execution_is_globally_disabled');
  if (record.stage !== 'training' && record.stage !== 'validation' && record.stage !== 'out_of_sample' && record.stage !== 'paper') throw new Error('rl_stage_invalid');
  if (record.seeds.length < 2) throw new Error('rl_seed_set_invalid');
  if (!record.evidence.licenseReviewed) throw new Error('rl_license_review_required');
  if (!record.evidence.dataRightsReviewed) throw new Error('rl_data_rights_review_required');
  if (!record.evidence.securityReviewed) throw new Error('rl_security_review_required');
  if (!record.evidence.environmentIntegrityVerified) throw new Error('rl_environment_integrity_required');
  if (!record.evidence.rewardDesignReviewed) throw new Error('rl_reward_design_review_required');
  if (!record.evidence.provenanceVerified) throw new Error('rl_provenance_required');
  if (!record.evidence.testsVerified) throw new Error('rl_tests_required');
  if (!record.evidence.reproducibilityVerified) throw new Error('rl_reproducibility_required');
  if (!record.evidence.seedStabilityVerified) throw new Error('rl_seed_stability_required');
  if (!record.evidence.walkForwardVerified) throw new Error('rl_walk_forward_required');
  if (!record.evidence.overfitControlsVerified) throw new Error('rl_overfit_controls_required');
  if (!record.evidence.paperExecutionVerified) throw new Error('rl_paper_execution_required');
  return { ...record, status: 'assessed', evidenceHash: rlCapabilityEvidenceHash(record.evidence), updatedAt: Date.now() };
}

export function rlCapabilityEligible(input: {
  validationReward: number;
  maxDrawdown: number;
  turnover: number;
  seedAgreement: number;
  outOfSampleReady: boolean;
}, record: RlCapabilityRecord): boolean {
  return input.outOfSampleReady
    && Number.isFinite(input.validationReward)
    && input.validationReward >= record.minValidationReward
    && Number.isFinite(input.maxDrawdown)
    && input.maxDrawdown <= record.maxDrawdown
    && Number.isFinite(input.turnover)
    && input.turnover <= record.maxTurnover
    && Number.isFinite(input.seedAgreement)
    && input.seedAgreement >= record.minSeedAgreement;
}

export function approveRlCapability(record: RlCapabilityRecord): RlCapabilityRecord {
  if (record.status !== 'assessed') throw new Error(`invalid_status_for_rl_approval:${record.status}`);
  if (!allEvidencePassed(record.evidence)) throw new Error('all_rl_evidence_required');
  return { ...record, status: 'approved', updatedAt: Date.now() };
}

export function deployRlCapability(record: RlCapabilityRecord): RlCapabilityRecord {
  if (record.status !== 'approved') throw new Error(`invalid_status_for_rl_deployment:${record.status}`);
  if (!allEvidencePassed(record.evidence)) throw new Error('rl_deployment_requires_complete_evidence');
  if (record.liveExecutionEnabled) throw new Error('live_execution_is_globally_disabled');
  return { ...record, status: 'deployed', liveExecutionEnabled: false, updatedAt: Date.now() };
}

export function canUseRlForResearch(record: RlCapabilityRecord): boolean {
  return record.status === 'deployed' && record.liveExecutionEnabled === false && allEvidencePassed(record.evidence);
}

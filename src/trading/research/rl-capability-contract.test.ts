import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assessRlCapability,
  canUseRlForResearch,
  createRlCapabilityRecord,
  deployRlCapability,
  approveRlCapability,
  rlCapabilityEligible,
} from './rl-capability-contract.ts';

const allEvidence = {
  licenseReviewed: true,
  dataRightsReviewed: true,
  securityReviewed: true,
  testsVerified: true,
  provenanceVerified: true,
  reproducibilityVerified: true,
  environmentIntegrityVerified: true,
  rewardDesignReviewed: true,
  seedStabilityVerified: true,
  walkForwardVerified: true,
  overfitControlsVerified: true,
  paperExecutionVerified: true,
};

function buildRecord() {
  return createRlCapabilityRecord({
    capabilityId: 'btc-ppo-v1',
    environmentId: 'crypto-paper-env-v1',
    algorithm: 'ppo',
    observationSpace: { dimensions: 24, continuous: true },
    actionSpace: { dimensions: 3, continuous: true, maxMagnitude: 1 },
    rewardPolicy: { maxStepReward: 1, maxEpisodeReward: 100, turnoverPenalty: 0.1, drawdownPenalty: 0.25 },
    trainEpisodes: 200,
    validationEpisodes: 50,
    outOfSampleEpisodes: 50,
    seeds: [7, 11, 19],
    minValidationReward: 0.5,
    maxDrawdown: 0.25,
    maxTurnover: 1,
    minSeedAgreement: 0.67,
    evidence: allEvidence,
    provenance: 'native-rl-research-contract',
  });
}

test('RL capability stays fail-closed and structurally paper-only', () => {
  const record = buildRecord();
  assert.equal(record.liveExecutionEnabled, false);
  assert.equal(record.status, 'proposed');
  assert.equal(canUseRlForResearch(record), false);
});

test('RL assessment requires complete research governance evidence', () => {
  const record = buildRecord();
  const assessed = assessRlCapability(record);
  assert.equal(assessed.status, 'assessed');
  assert.equal(assessed.liveExecutionEnabled, false);
});

test('RL eligibility enforces OOS, reward, drawdown, turnover and seed stability', () => {
  const record = buildRecord();
  assert.equal(rlCapabilityEligible({ validationReward: 0.8, maxDrawdown: 0.12, turnover: 0.4, seedAgreement: 0.8, outOfSampleReady: true }, record), true);
  assert.equal(rlCapabilityEligible({ validationReward: 0.8, maxDrawdown: 0.35, turnover: 0.4, seedAgreement: 0.8, outOfSampleReady: true }, record), false);
  assert.equal(rlCapabilityEligible({ validationReward: 0.8, maxDrawdown: 0.12, turnover: 0.4, seedAgreement: 0.4, outOfSampleReady: true }, record), false);
  assert.equal(rlCapabilityEligible({ validationReward: 0.8, maxDrawdown: 0.12, turnover: 0.4, seedAgreement: 0.8, outOfSampleReady: false }, record), false);
});

test('RL approval and deployment require full evidence and correct lifecycle', () => {
  const approved = approveRlCapability(assessRlCapability(buildRecord()));
  assert.equal(approved.status, 'approved');
  const deployed = deployRlCapability(approved);
  assert.equal(deployed.status, 'deployed');
  assert.equal(deployed.liveExecutionEnabled, false);
  assert.equal(canUseRlForResearch(deployed), true);
});

test('RL contract rejects invalid action and seed configuration', () => {
  assert.throws(() => createRlCapabilityRecord({
    capabilityId: 'bad-action', environmentId: 'env', algorithm: 'ppo',
    observationSpace: { dimensions: 2, continuous: true },
    actionSpace: { dimensions: 1, continuous: true, maxMagnitude: 0 },
    rewardPolicy: { maxStepReward: 1, maxEpisodeReward: 5, turnoverPenalty: 0, drawdownPenalty: 0 },
    seeds: [1], provenance: 'test',
  }), /action_space_max_magnitude_invalid/);
});

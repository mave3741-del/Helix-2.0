import assert from "node:assert/strict";
import test from "node:test";
import { rankRlTrials, rlTrialEligible, scoreRlTrial } from "./rl-lane.ts";

test("RL gate requires OOS and bounded risk", () => {
  assert.equal(rlTrialEligible({ trialId: "a", algorithm: "ppo", environmentHash: "e", seed: 1, trainEpisodes: 100, trainReward: 2, validationReward: 0.6, maxDrawdown: 0.1, turnover: 0.2, oosReady: true }, { minValidationReward: 0.5, maxDrawdown: 0.2, maxTurnover: 1 }), true);
  assert.equal(rlTrialEligible({ trialId: "b", algorithm: "ppo", environmentHash: "e", seed: 2, trainEpisodes: 100, trainReward: 9, validationReward: 0.9, maxDrawdown: 0.4, turnover: 0.2, oosReady: true }, { minValidationReward: 0.5, maxDrawdown: 0.2, maxTurnover: 1 }), false);
});

test("RL ranking favors better validation/risk profile", () => {
  const trials = [
    { trialId: "bad", algorithm: "sac" as const, environmentHash: "e", seed: 1, trainEpisodes: 10, trainReward: 2, validationReward: 0.7, maxDrawdown: 0.3, turnover: 0.5, oosReady: true },
    { trialId: "good", algorithm: "ppo" as const, environmentHash: "e", seed: 2, trainEpisodes: 10, trainReward: 1, validationReward: 0.7, maxDrawdown: 0.1, turnover: 0.2, oosReady: true },
  ];
  assert.equal(rankRlTrials(trials)[0].trialId, "good");
  assert.ok(scoreRlTrial(trials[1]) > scoreRlTrial(trials[0]));
});

import { evaluateRlTrial } from './rl-evaluation-contract.ts';

test('RL evaluation requires multiple seeds and bounded rewards', () => {
  const trial = { trialId: 'eval', algorithm: 'ppo' as const, environmentHash: 'env', seed: 1, trainEpisodes: 100, trainReward: 1, validationReward: 0.7, maxDrawdown: 0.1, turnover: 0.2, oosReady: true };
  assert.throws(() => evaluateRlTrial({ trial, seedRewards: { '1': 0.7 }, seedDrawdowns: { '1': 0.1 }, seedTurnovers: { '1': 0.2 }, rewardBound: 1, episodeCount: 100 }), /multiple_seeds/);
  assert.throws(() => evaluateRlTrial({ trial, seedRewards: { '1': 2, '2': 0.7 }, seedDrawdowns: { '1': 0.1, '2': 0.1 }, seedTurnovers: { '1': 0.2, '2': 0.2 }, rewardBound: 1, episodeCount: 100 }), /reward_bound_exceeded/);
});

test('RL evaluation is deterministic and uses worst-case risk across seeds', () => {
  const trial = { trialId: 'eval', algorithm: 'ppo' as const, environmentHash: 'env', seed: 1, trainEpisodes: 100, trainReward: 1, validationReward: 0.7, maxDrawdown: 0.1, turnover: 0.2, oosReady: true };
  const input = { trial, seedRewards: { '11': 0.8, '7': 0.6, '19': 0.7 }, seedDrawdowns: { '11': 0.1, '7': 0.2, '19': 0.15 }, seedTurnovers: { '11': 0.2, '7': 0.4, '19': 0.3 }, rewardBound: 1, episodeCount: 100 };
  const a = evaluateRlTrial(input);
  const b = evaluateRlTrial(input);
  assert.equal(a.deterministicHash, b.deterministicHash);
  assert.equal(a.worstDrawdown, 0.2);
  assert.equal(a.worstTurnover, 0.4);
  assert.equal(a.rewardBoundRespected, true);
});

import { createHash } from 'node:crypto';
import type { RlTrial } from './rl-lane.ts';

export interface RlEvaluationInput {
  trial: RlTrial;
  seedRewards: Record<string, number>;
  seedDrawdowns: Record<string, number>;
  seedTurnovers: Record<string, number>;
  rewardBound: number;
  episodeCount: number;
}

export interface RlEvaluationResult {
  trialId: string;
  seedCount: number;
  seedAgreement: number;
  meanValidationReward: number;
  worstDrawdown: number;
  worstTurnover: number;
  rewardBoundRespected: boolean;
  deterministicHash: string;
}

const finitePositive = (v: number) => Number.isFinite(v) && v > 0;

function stable(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  const o = value as Record<string, unknown>;
  return `{${Object.keys(o).sort().map(k => `${JSON.stringify(k)}:${stable(o[k])}`).join(',')}}`;
}

function hash(value: unknown): string {
  return createHash('sha256').update(stable(value), 'utf8').digest('hex');
}

export function evaluateRlTrial(input: RlEvaluationInput): RlEvaluationResult {
  if (!finitePositive(input.rewardBound)) throw new Error('rl_reward_bound_invalid');
  if (!Number.isInteger(input.episodeCount) || input.episodeCount <= 0) throw new Error('rl_episode_count_invalid');
  const seeds = Object.keys(input.seedRewards).sort((a, b) => Number(a) - Number(b));
  if (seeds.length < 2) throw new Error('rl_evaluation_requires_multiple_seeds');
  for (const seed of seeds) {
    const reward = input.seedRewards[seed];
    const dd = input.seedDrawdowns[seed];
    const turnover = input.seedTurnovers[seed];
    if (![reward, dd, turnover].every(Number.isFinite)) throw new Error(`rl_seed_metric_invalid:${seed}`);
    if (Math.abs(reward) > input.rewardBound) throw new Error(`rl_reward_bound_exceeded:${seed}`);
    if (dd < 0 || turnover < 0) throw new Error(`rl_risk_metric_invalid:${seed}`);
  }
  const rewards = seeds.map(s => input.seedRewards[s]);
  const mean = rewards.reduce((a, b) => a + b, 0) / rewards.length;
  const median = [...rewards].sort((a, b) => a - b)[Math.floor(rewards.length / 2)];
  const agreed = rewards.filter(v => v >= median).length / rewards.length;
  const result = {
    trialId: input.trial.trialId,
    seedCount: seeds.length,
    seedAgreement: agreed,
    meanValidationReward: mean,
    worstDrawdown: Math.max(...seeds.map(s => input.seedDrawdowns[s])),
    worstTurnover: Math.max(...seeds.map(s => input.seedTurnovers[s])),
    rewardBoundRespected: true,
  };
  return { ...result, deterministicHash: hash({ ...result, environmentHash: input.trial.environmentHash, algorithm: input.trial.algorithm, episodeCount: input.episodeCount, seedRewards: input.seedRewards, seedDrawdowns: input.seedDrawdowns, seedTurnovers: input.seedTurnovers }) };
}

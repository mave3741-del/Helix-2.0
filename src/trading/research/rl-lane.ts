export type RlAlgorithm = "ppo" | "sac" | "td3" | "a2c" | "ddpg";

export interface RlTrial {
  trialId: string;
  algorithm: RlAlgorithm;
  environmentHash: string;
  seed: number;
  trainEpisodes: number;
  trainReward: number;
  validationReward: number;
  maxDrawdown: number;
  turnover: number;
  oosReady: boolean;
}

export interface RlGate {
  minValidationReward: number;
  maxDrawdown: number;
  maxTurnover: number;
}

export function scoreRlTrial(trial: RlTrial): number {
  const reward = Math.max(-1, Math.min(1, trial.validationReward));
  const drawdownPenalty = Math.max(0, Math.min(1, trial.maxDrawdown));
  const turnoverPenalty = Math.max(0, Math.min(1, trial.turnover));
  return reward * (1 - 0.5 * drawdownPenalty) * (1 - 0.25 * turnoverPenalty);
}

export function rlTrialEligible(trial: RlTrial, gate: RlGate): boolean {
  return trial.oosReady &&
    trial.validationReward >= gate.minValidationReward &&
    trial.maxDrawdown <= gate.maxDrawdown &&
    trial.turnover <= gate.maxTurnover;
}

export function rankRlTrials(trials: RlTrial[]): RlTrial[] {
  return [...trials].sort((a, b) => scoreRlTrial(b) - scoreRlTrial(a));
}

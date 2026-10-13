import { createHash } from 'node:crypto';
import type { Bar } from '../../runtime/tools/trading.ts';
import { evaluateRlMultiSeedOos, type RlMultiSeedOosGate, type RlMultiSeedOosResult } from './rl-multiseed-walk-forward.ts';
import { evaluateRlStress, type RlStressGate, type RlStressMetrics, type RlStressScenario, type RlStressResult } from './rl-stress-evaluation.ts';
import type { FittedStrategy } from './walk-forward.ts';

export interface RlRobustnessInput {
  bars: Bar[];
  seeds: number[];
  trainBars: number;
  testBars: number;
  stepBars?: number;
  embargoBars?: number;
  feeBps?: number;
  slippageBps?: number;
  environmentHash: string;
  algorithm: string;
  fit: (seed: number, train: Bar[], fold: number) => FittedStrategy;
  stressScenarios?: RlStressScenario[];
  stressEvaluate: (seed: number, input: { scenario: RlStressScenario; bars: Bar[]; feeBps: number; slippageBps: number; degraded: boolean }) => RlStressMetrics;
}

export interface RlRobustnessGate {
  oos: RlMultiSeedOosGate;
  stress: RlStressGate;
  minCombinedStressPassRate: number;
  minSeedRobustnessRate: number;
}

export interface RlRobustnessResult {
  oos: RlMultiSeedOosResult;
  stressBySeed: Array<{ seed: number; result: RlStressResult }>;
  aggregate: {
    seeds: number;
    stressCases: number;
    passedStressCases: number;
    combinedStressPassRate: number;
    robustSeeds: number;
    seedRobustnessRate: number;
  };
  gate: { eligible: boolean; reasons: string[] };
  deterministicHash: string;
}

const stable = (v: unknown): string => v === null || typeof v !== 'object' ? JSON.stringify(v) : Array.isArray(v) ? `[${v.map(stable).join(',')}]` : `{${Object.keys(v as Record<string, unknown>).sort().map(k => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`).join(',')}}`;
const hash = (v: unknown) => createHash('sha256').update(stable(v), 'utf8').digest('hex');

export function evaluateRlRobustness(input: RlRobustnessInput, gate: RlRobustnessGate): RlRobustnessResult {
  if (!input.environmentHash.trim()) throw new Error('rl_robustness_environment_hash_required');
  if (!input.algorithm.trim()) throw new Error('rl_robustness_algorithm_required');
  if (!Number.isFinite(gate.minCombinedStressPassRate) || gate.minCombinedStressPassRate < 0 || gate.minCombinedStressPassRate > 1) throw new Error('rl_robustness_stress_pass_rate_invalid');
  if (!Number.isFinite(gate.minSeedRobustnessRate) || gate.minSeedRobustnessRate < 0 || gate.minSeedRobustnessRate > 1) throw new Error('rl_robustness_seed_rate_invalid');

  const oos = evaluateRlMultiSeedOos({
    bars: input.bars, seeds: input.seeds, trainBars: input.trainBars, testBars: input.testBars,
    stepBars: input.stepBars, embargoBars: input.embargoBars, feeBps: input.feeBps, slippageBps: input.slippageBps,
    environmentHash: input.environmentHash, algorithm: input.algorithm, fit: input.fit,
  }, gate.oos);

  const stressBySeed = [...new Set(input.seeds)].sort((a, b) => a - b).map(seed => ({
    seed,
    result: evaluateRlStress({
      bars: input.bars, environmentHash: input.environmentHash, algorithm: input.algorithm, seed,
      scenarios: input.stressScenarios, baseFeeBps: input.feeBps, baseSlippageBps: input.slippageBps,
      evaluate: stress => input.stressEvaluate(seed, stress),
    }, gate.stress),
  }));

  const stressCases = stressBySeed.reduce((n, x) => n + x.result.aggregate.scenarioCount, 0);
  const passedStressCases = stressBySeed.reduce((n, x) => n + x.result.aggregate.passedScenarios, 0);
  const combinedStressPassRate = stressCases ? passedStressCases / stressCases : 0;
  const robustSeeds = stressBySeed.filter(x => x.result.gate.eligible).length;
  const seedRobustnessRate = stressBySeed.length ? robustSeeds / stressBySeed.length : 0;

  const reasons: string[] = [];
  if (!oos.gate.eligible) reasons.push('oos_gate_failed');
  if (combinedStressPassRate < gate.minCombinedStressPassRate) reasons.push('combined_stress_pass_rate_below_gate');
  if (seedRobustnessRate < gate.minSeedRobustnessRate) reasons.push('seed_robustness_rate_below_gate');

  const aggregate = { seeds: stressBySeed.length, stressCases, passedStressCases, combinedStressPassRate, robustSeeds, seedRobustnessRate };
  const gateResult = { eligible: reasons.length === 0, reasons };
  return {
    oos, stressBySeed, aggregate, gate: gateResult,
    deterministicHash: hash({ environmentHash: input.environmentHash, algorithm: input.algorithm, seeds: [...new Set(input.seeds)].sort((a, b) => a - b), oosHash: oos.deterministicHash, stressHashes: stressBySeed.map(x => ({ seed: x.seed, hash: x.result.deterministicHash })), aggregate, gate: gateResult }),
  };
}

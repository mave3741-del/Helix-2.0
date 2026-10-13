import { createHash } from 'node:crypto';
import type { Bar } from '../../runtime/tools/trading.ts';
import type { FittedStrategy } from './walk-forward.ts';
import { evaluateRlOos, type RlOosEvaluationResult } from './rl-oos-evaluation.ts';

export interface RlMultiSeedOosInput {
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
}

export interface RlMultiSeedOosGate {
  minSeedAgreement: number;
  minProfitableWindowRate: number;
  maxWorstDrawdown: number;
  minMedianReturn: number;
  minMeanSharpe: number;
}

export interface RlMultiSeedOosResult {
  seeds: number[];
  evaluations: Array<{ seed: number; result: RlOosEvaluationResult }>;
  aggregate: {
    seeds: number;
    windowsPerSeed: number;
    totalWindows: number;
    profitableWindows: number;
    profitableWindowRate: number;
    medianReturn: number;
    worstDrawdown: number;
    meanSharpe: number;
    seedAgreement: number;
  };
  gate: { eligible: boolean; reasons: string[] };
  deterministicHash: string;
}

const median = (values: number[]) => {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : ((s[m - 1] ?? 0) + (s[m] ?? 0)) / 2;
};
const stable = (v: unknown): string => v === null || typeof v !== 'object' ? JSON.stringify(v) : Array.isArray(v) ? `[${v.map(stable).join(',')}]` : `{${Object.keys(v as Record<string, unknown>).sort().map(k => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`).join(',')}}`;
const hash = (v: unknown) => createHash('sha256').update(stable(v), 'utf8').digest('hex');

/** Combines independent RL seeds over identical chronological OOS folds. A seed must pass the same data geometry; promotion uses worst-case risk and cross-seed agreement. */
export function evaluateRlMultiSeedOos(input: RlMultiSeedOosInput, gate: RlMultiSeedOosGate): RlMultiSeedOosResult {
  if (!input.environmentHash.trim()) throw new Error('rl_multiseed_environment_hash_required');
  if (!input.algorithm.trim()) throw new Error('rl_multiseed_algorithm_required');
  const seeds = [...new Set(input.seeds)].sort((a, b) => a - b);
  if (seeds.length < 2 || seeds.some(seed => !Number.isInteger(seed))) throw new Error('rl_multiseed_requires_two_distinct_integer_seeds');
  if (!Number.isFinite(gate.minSeedAgreement) || gate.minSeedAgreement < 0 || gate.minSeedAgreement > 1) throw new Error('rl_multiseed_gate_seed_agreement_invalid');
  if (!Number.isFinite(gate.minProfitableWindowRate) || gate.minProfitableWindowRate < 0 || gate.minProfitableWindowRate > 1) throw new Error('rl_multiseed_gate_profit_rate_invalid');
  if (!Number.isFinite(gate.maxWorstDrawdown) || gate.maxWorstDrawdown < 0) throw new Error('rl_multiseed_gate_drawdown_invalid');
  if (!Number.isFinite(gate.minMedianReturn)) throw new Error('rl_multiseed_gate_return_invalid');
  if (!Number.isFinite(gate.minMeanSharpe)) throw new Error('rl_multiseed_gate_sharpe_invalid');

  const evaluations = seeds.map(seed => ({ seed, result: evaluateRlOos({
    bars: input.bars, trainBars: input.trainBars, testBars: input.testBars, stepBars: input.stepBars,
    embargoBars: input.embargoBars, feeBps: input.feeBps, slippageBps: input.slippageBps,
    environmentHash: input.environmentHash, algorithm: input.algorithm, seed,
    fit: (train, fold) => input.fit(seed, train, fold),
  }) }));

  const counts = evaluations.map(x => x.result.windows.length);
  if (new Set(counts).size !== 1 || counts[0] === 0) throw new Error('rl_multiseed_oos_geometry_mismatch');

  const profitableRates = evaluations.map(x => x.result.aggregate.windows ? x.result.aggregate.profitableWindows / x.result.aggregate.windows : 0);
  const medianReturn = median(evaluations.map(x => x.result.aggregate.medianReturn));
  const worstDrawdown = Math.max(...evaluations.map(x => x.result.aggregate.worstDrawdown));
  const meanSharpe = evaluations.reduce((sum, x) => sum + x.result.aggregate.meanSharpe, 0) / evaluations.length;
  const seedMedians = evaluations.map(x => x.result.aggregate.medianReturn);
  const agreementMedian = median(seedMedians);
  const seedAgreement = seedMedians.filter(x => x >= agreementMedian).length / seedMedians.length;
  const profitableWindowRate = Math.min(...profitableRates);
  const reasons: string[] = [];
  if (seedAgreement < gate.minSeedAgreement) reasons.push('seed_agreement_below_gate');
  if (profitableWindowRate < gate.minProfitableWindowRate) reasons.push('profitable_window_rate_below_gate');
  if (worstDrawdown > gate.maxWorstDrawdown) reasons.push('worst_drawdown_above_gate');
  if (medianReturn < gate.minMedianReturn) reasons.push('median_return_below_gate');
  if (meanSharpe < gate.minMeanSharpe) reasons.push('mean_sharpe_below_gate');

  const aggregate = { seeds: seeds.length, windowsPerSeed: counts[0]!, totalWindows: counts[0]! * seeds.length, profitableWindows: Math.min(...evaluations.map(x => x.result.aggregate.profitableWindows)), profitableWindowRate, medianReturn, worstDrawdown, meanSharpe, seedAgreement };
  const gateResult = { eligible: reasons.length === 0, reasons };
  return { seeds, evaluations, aggregate, gate: gateResult, deterministicHash: hash({ environmentHash: input.environmentHash, algorithm: input.algorithm, seeds, config: { trainBars: input.trainBars, testBars: input.testBars, stepBars: input.stepBars ?? input.testBars, embargoBars: input.embargoBars ?? 0, feeBps: input.feeBps ?? 5, slippageBps: input.slippageBps ?? 2 }, aggregate, gate: gateResult }) };
}

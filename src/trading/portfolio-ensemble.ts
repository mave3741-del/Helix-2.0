export interface StrategyExperimentSnapshot {
  strategyId: string;
  experimentId: string;
  expectedReturn: number;
  volatility: number;
  maxDrawdown: number;
  sharpe: number;
  robustness: number;
  paperReturn: number;
  turnover: number;
  correlationToPortfolio: number;
  status: 'candidate' | 'challenger' | 'champion' | 'retired';
}

export interface StrategyScore {
  strategyId: string;
  score: number;
  riskAdjusted: number;
  robustnessAdjusted: number;
  diversificationBonus: number;
  reasons: string[];
}

export interface EnsembleAllocation {
  strategyId: string;
  weight: number;
  score: number;
}

export interface PerformanceAttribution {
  strategyId: string;
  contribution: number;
  riskContribution: number;
  excessVsEnsemble: number;
}

const clamp = (n: number, min = -1, max = 1) => Math.max(min, Math.min(max, n));

export function scoreStrategies(input: StrategyExperimentSnapshot[]): StrategyScore[] {
  return input.map((x) => {
    const riskAdjusted = x.sharpe - Math.max(0, x.maxDrawdown) * 2 - Math.max(0, x.volatility) * 0.1;
    const robustnessAdjusted = riskAdjusted * Math.max(0, Math.min(1, x.robustness));
    const diversificationBonus = (1 - Math.abs(clamp(x.correlationToPortfolio))) * 0.2;
    const score = robustnessAdjusted + diversificationBonus - Math.max(0, x.turnover) * 0.02;
    const reasons: string[] = [];
    if (x.robustness < 0.6) reasons.push('robustness_below_preferred_threshold');
    if (x.maxDrawdown > 0.25) reasons.push('drawdown_high');
    if (Math.abs(x.correlationToPortfolio) > 0.85) reasons.push('high_correlation');
    return { strategyId: x.strategyId, score, riskAdjusted, robustnessAdjusted, diversificationBonus, reasons };
  }).sort((a, b) => b.score - a.score || a.strategyId.localeCompare(b.strategyId));
}

export function chooseChampionChallenger(input: StrategyExperimentSnapshot[], minRobustness = 0.7): { champion: StrategyExperimentSnapshot | null; challengers: StrategyExperimentSnapshot[] } {
  const eligible = input.filter((x) => x.robustness >= minRobustness && x.maxDrawdown < 0.35 && x.status !== 'retired');
  const ranked = scoreStrategies(eligible);
  const byId = new Map(input.map((x) => [x.strategyId, x]));
  const championId = ranked[0]?.strategyId;
  return { champion: championId ? byId.get(championId) ?? null : null, challengers: ranked.slice(1).map((x) => byId.get(x.strategyId)!).filter(Boolean) };
}

export function allocateEnsemble(input: StrategyExperimentSnapshot[], maxStrategies = 5): EnsembleAllocation[] {
  const ranked = scoreStrategies(input).filter((x) => x.reasons.length < 2).slice(0, Math.max(1, maxStrategies));
  const positive = ranked.map((x) => ({ ...x, raw: Math.max(0, x.score) }));
  const total = positive.reduce((s, x) => s + x.raw, 0) || positive.length || 1;
  return positive.map((x) => ({ strategyId: x.strategyId, weight: x.raw > 0 ? x.raw / total : 1 / total, score: x.score }));
}

export function attributeEnsemblePerformance(input: { snapshots: StrategyExperimentSnapshot[]; realizedReturns: Record<string, number>; realizedRisk: Record<string, number>; allocations: EnsembleAllocation[] }): PerformanceAttribution[] {
  const ensembleReturn = input.allocations.reduce((sum, a) => sum + (input.realizedReturns[a.strategyId] ?? 0) * a.weight, 0);
  return input.allocations.map((a) => {
    const ret = input.realizedReturns[a.strategyId] ?? 0;
    const risk = input.realizedRisk[a.strategyId] ?? 0;
    const contribution = ret * a.weight;
    return { strategyId: a.strategyId, contribution, riskContribution: risk * a.weight, excessVsEnsemble: contribution - ensembleReturn * a.weight };
  });
}

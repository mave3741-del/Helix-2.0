import type { StrategyPerformanceSnapshot } from './post-trade.ts';
import type { ChampionDecision, ChampionMetrics } from './champion-gate.ts';
import { evaluateChampionEligibility } from './champion-gate.ts';

export interface ChallengerEvaluation {
  champion: ChampionMetrics;
  challenger: ChampionMetrics;
  championEligible: ChampionDecision;
  challengerEligible: ChampionDecision;
  minScoreAdvantage: number;
  minPnlAdvantage: number;
  regimeCoverageMin: number;
}

export interface ChampionChallengerDecision {
  promote: boolean;
  retireChampion: boolean;
  reasons: string[];
  scoreDelta: number;
  pnlDelta: number;
}

function regimeCoverage(snapshot: StrategyPerformanceSnapshot): number {
  const regimes = Object.values(snapshot.byRegime);
  if (!regimes.length) return 0;
  return regimes.filter((r) => r.trades >= 5 && r.winRate > 0.5).length / regimes.length;
}

export function decideChampionChallenger(input: ChallengerEvaluation & { championSnapshot: StrategyPerformanceSnapshot; challengerSnapshot: StrategyPerformanceSnapshot }): ChampionChallengerDecision {
  const reasons: string[] = [];
  const scoreDelta = input.challenger.statistical.adjustedScore - input.champion.statistical.adjustedScore;
  const pnlDelta = input.challengerSnapshot.netPnl - input.championSnapshot.netPnl;
  const championCoverage = regimeCoverage(input.championSnapshot);
  const challengerCoverage = regimeCoverage(input.challengerSnapshot);
  if (!input.challengerEligible.eligible) reasons.push('challenger_gate_failed');
  if (!input.championEligible.eligible) reasons.push('champion_gate_failed');
  if (scoreDelta < input.minScoreAdvantage) reasons.push('insufficient_score_advantage');
  if (pnlDelta < input.minPnlAdvantage) reasons.push('insufficient_pnl_advantage');
  if (challengerCoverage < input.regimeCoverageMin) reasons.push('insufficient_regime_coverage');
  if (challengerCoverage < championCoverage * 0.8) reasons.push('regime_coverage_regression');
  return {
    promote: reasons.length === 0,
    retireChampion: reasons.length === 0,
    reasons,
    scoreDelta,
    pnlDelta,
  };
}

export function championMetricsFromSnapshot(snapshot: StrategyPerformanceSnapshot, base: Omit<ChampionMetrics, 'strategyId' | 'evaluationAt' | 'paperTradeCount' | 'currentDrawdown'> & { strategyId?: string; evaluationAt?: number }): ChampionMetrics {
  return {
    ...base,
    strategyId: snapshot.strategyId,
    evaluationAt: base.evaluationAt ?? snapshot.asOfTs,
    paperTradeCount: snapshot.tradeCount,
    currentDrawdown: snapshot.maxDrawdown,
  };
}

export { evaluateChampionEligibility };

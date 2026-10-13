import type { StrategyPerformanceSnapshot } from '../post-trade.ts';
import type { ChampionMetrics } from '../champion-gate.ts';
import { evaluateChampionEligibility } from '../champion-gate.ts';
import { decideChampionChallenger } from '../champion-challenger.ts';

export interface ChampionRotationInput {
  championMetrics: ChampionMetrics;
  challengerMetrics: ChampionMetrics[];
  championSnapshot: StrategyPerformanceSnapshot;
  challengerSnapshots: StrategyPerformanceSnapshot[];
  minScoreAdvantage?: number;
  minPnlAdvantage?: number;
  regimeCoverageMin?: number;
  now?: number;
}

export interface ChampionRotationResult {
  currentChampion: string;
  promotedChampion: string | null;
  challengerRank: string[];
  rationale: string[];
}

export function evaluateChampionRotation(input: ChampionRotationInput): ChampionRotationResult {
  const now = input.now ?? Date.now();
  const championEligible = evaluateChampionEligibility(input.championMetrics, now);
  const challengerRank = input.challengerMetrics.map((challenger, index) => ({
    challenger,
    snapshot: input.challengerSnapshots[index],
  })).map((x) => ({ x, eligible: evaluateChampionEligibility(x.challenger, now) }))
    .sort((a, b) => b.eligible.score - a.eligible.score)
    .map((x) => x.x.challenger.strategyId);
  for (const candidateId of challengerRank) {
    const index = input.challengerMetrics.findIndex((x) => x.strategyId === candidateId);
    const challengerMetrics = input.challengerMetrics[index];
    const challengerSnapshot = input.challengerSnapshots[index];
    const challengerEligible = evaluateChampionEligibility(challengerMetrics, now);
    const decision = decideChampionChallenger({
      champion: input.championMetrics,
      challenger: challengerMetrics,
      championEligible,
      challengerEligible,
      minScoreAdvantage: input.minScoreAdvantage ?? 0.05,
      minPnlAdvantage: input.minPnlAdvantage ?? 0,
      regimeCoverageMin: input.regimeCoverageMin ?? 0.5,
      championSnapshot: input.championSnapshot,
      challengerSnapshot,
    });
    if (decision.promote) {
      return { currentChampion: input.championMetrics.strategyId, promotedChampion: candidateId, challengerRank, rationale: ['challenger_passed_champion_gate', ...decision.reasons] };
    }
  }
  return { currentChampion: input.championMetrics.strategyId, promotedChampion: null, challengerRank, rationale: championEligible.eligible ? ['no_challenger_cleared_promotion_threshold'] : ['current_champion_not_eligible', ...championEligible.reasons] };
}

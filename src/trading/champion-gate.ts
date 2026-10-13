import { passesPromotionStatistics, type ResearchStatisticalEvidence } from './research/statistics.ts';

export interface ChampionMetrics {
  strategyId: string;
  evaluationAt: number;
  maxAgeMs: number;
  statistical: ResearchStatisticalEvidence;
  parameterSensitivityPassed: boolean;
  bootstrapPassed: boolean;
  oosPassed: boolean;
  walkForwardPassed: boolean;
  paperTradeCount: number;
  currentDrawdown: number;
}
export interface ChampionDecision { eligible: boolean; reasons: string[]; score: number; }

export function evaluateChampionEligibility(m: ChampionMetrics, now=Date.now()): ChampionDecision {
  const reasons:string[]=[];
  if(now-m.evaluationAt>Math.max(60_000,m.maxAgeMs)) reasons.push('metrics_stale');
  if(!passesPromotionStatistics(m.statistical)) reasons.push('statistical_gate_failed');
  if(!m.parameterSensitivityPassed) reasons.push('parameter_sensitivity_failed');
  if(!m.bootstrapPassed) reasons.push('bootstrap_failed');
  if(!m.oosPassed) reasons.push('oos_failed');
  if(!m.walkForwardPassed) reasons.push('walk_forward_failed');
  if(m.paperTradeCount<50) reasons.push('paper_sample_too_small');
  if(!(m.currentDrawdown<0.25)) reasons.push('current_drawdown_exceeded');
  const score=m.statistical.adjustedScore + (m.parameterSensitivityPassed?0.1:0) + (m.bootstrapPassed?0.1:0);
  return {eligible:reasons.length===0,reasons:[...new Set(reasons)],score};
}

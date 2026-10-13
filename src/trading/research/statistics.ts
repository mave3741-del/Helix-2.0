export interface ResearchStatisticalEvidence {
  tradeCount: number;
  meanReturn: number;
  volatility: number;
  sharpe: number;
  tStatistic: number;
  significantAt95: boolean;
  maxDrawdown: number;
  robustness: number;
  multipleTestingPenalty: number;
  adjustedScore: number;
}

function mean(xs:number[]):number { return xs.length ? xs.reduce((a,b)=>a+b,0)/xs.length : 0; }

/** Deterministic research evidence gate. It is deliberately conservative and fail-closed. */
export function evaluateStatisticalEvidence(input:{returns:number[]; maxDrawdown:number; robustness:number; candidateCount?:number}): ResearchStatisticalEvidence {
  const returns=input.returns.filter(Number.isFinite);
  const n=returns.length; const avg=mean(returns);
  const variance=n>1?mean(returns.map(x=>(x-avg)**2)):0;
  const volatility=Math.sqrt(Math.max(0,variance));
  const sharpe=volatility>0?(avg/volatility)*Math.sqrt(n):0;
  const tStatistic=volatility>0?avg/(volatility/Math.sqrt(Math.max(1,n))):0;
  const significantAt95=n>=30 && tStatistic>=1.96;
  const candidates=Math.max(1,Math.floor(input.candidateCount??1));
  // Conservative Bonferroni-style confidence penalty for search breadth.
  const multipleTestingPenalty=candidates<=1?1:Math.max(0.25,1-Math.min(0.75,Math.log10(candidates)/4));
  const adjustedScore=(sharpe*0.5 + input.robustness*0.5)*multipleTestingPenalty;
  return {tradeCount:n,meanReturn:avg,volatility,sharpe,tStatistic,significantAt95,maxDrawdown:input.maxDrawdown,robustness:input.robustness,multipleTestingPenalty,adjustedScore};
}

export function passesPromotionStatistics(e:ResearchStatisticalEvidence): boolean {
  return e.tradeCount>=50 && e.significantAt95 && e.robustness>=0.7 && e.maxDrawdown<0.25 && e.multipleTestingPenalty>=0.5;
}

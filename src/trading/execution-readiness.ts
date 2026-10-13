import type { Exposure } from './portfolio.ts';
import { checkPortfolioLimits } from './portfolio.ts';

export interface ExecutionReadinessInput { equity:number; exposures:Exposure[]; symbol:string; orderNotional:number; sector?:string; market?:string; maxGrossPct?:number; maxNetPct?:number; maxSinglePct?:number; maxThemePct?:number; maxCorrelation?:number; correlationToPortfolio?:number; }
export interface ExecutionReadiness { ok:boolean; reasons:string[]; projectedGrossPct:number; projectedSinglePct:number; projectedThemePct:number; }

export function evaluateExecutionReadiness(input:ExecutionReadinessInput):ExecutionReadiness {
  const reasons:string[]=[]; if(!(input.orderNotional>0)||!(input.equity>0)) return {ok:false,reasons:['invalid_order_notional_or_equity'],projectedGrossPct:Infinity,projectedSinglePct:Infinity,projectedThemePct:Infinity};
  const portfolio=checkPortfolioLimits(input.exposures,input.equity,input.maxGrossPct??2,input.maxNetPct??1,input.maxSinglePct??0.25);
  const gross=(portfolio.grossNotional+Math.abs(input.orderNotional))/input.equity;
  const symbolExisting=input.exposures.filter(x=>x.symbol===input.symbol).reduce((s,x)=>s+Math.abs(x.notional),0);
  const single=(symbolExisting+Math.abs(input.orderNotional))/input.equity;
  const themeExisting=input.sector?input.exposures.filter(x=>x.sector===input.sector).reduce((s,x)=>s+Math.abs(x.notional),0):0;
  const theme=(themeExisting+Math.abs(input.orderNotional))/input.equity;
  if(!portfolio.ok) reasons.push(...portfolio.reasons); if(gross>(input.maxGrossPct??2)) reasons.push('projected_gross_exposure_exceeded'); if(single>(input.maxSinglePct??0.25)) reasons.push('projected_single_concentration_exceeded'); if(theme>(input.maxThemePct??0.5)) reasons.push('projected_theme_concentration_exceeded');
  if(input.correlationToPortfolio!=null&&Math.abs(input.correlationToPortfolio)>(input.maxCorrelation??0.85)) reasons.push('portfolio_correlation_exceeded');
  return {ok:reasons.length===0,reasons:[...new Set(reasons)],projectedGrossPct:gross,projectedSinglePct:single,projectedThemePct:theme};
}

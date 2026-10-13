export type RiskRegime = 'normal' | 'high-vol' | 'liquidity-stress' | 'drawdown' | string;

export interface RiskBudgetPolicy {
  equity: number;
  maxGrossExposurePct: number;
  maxNetExposurePct: number;
  maxStrategyRiskPct: number;
  regimeMultipliers: Record<string, number>;
  minimumCashPct: number;
}

export interface RiskBudgetAllocation {
  availableGrossRiskCapital: number;
  availableNetRiskCapital: number;
  strategyRiskCapitals: Record<string, number>;
  regimeMultiplier: number;
  cashReserve: number;
  rationale: string[];
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

export function buildRiskBudget(policy: RiskBudgetPolicy, regime: RiskRegime, strategyIds: string[]): RiskBudgetAllocation {
  if (!(policy.equity > 0)) throw new Error('invalid_risk_budget_equity');
  if (policy.maxGrossExposurePct <= 0 || policy.maxGrossExposurePct > 1) throw new Error('invalid_gross_exposure_limit');
  if (policy.maxNetExposurePct <= 0 || policy.maxNetExposurePct > 1) throw new Error('invalid_net_exposure_limit');
  if (policy.maxStrategyRiskPct <= 0 || policy.maxStrategyRiskPct > 1) throw new Error('invalid_strategy_risk_limit');
  if (policy.minimumCashPct < 0 || policy.minimumCashPct >= 1) throw new Error('invalid_cash_reserve');

  const regimeMultiplier = clamp(policy.regimeMultipliers[regime] ?? 1, 0, 1);
  const cashReserve = policy.equity * policy.minimumCashPct;
  const available = Math.max(0, policy.equity - cashReserve);
  const gross = available * policy.maxGrossExposurePct * regimeMultiplier;
  const net = available * policy.maxNetExposurePct * regimeMultiplier;
  const perStrategy = available * policy.maxStrategyRiskPct * regimeMultiplier;
  const strategyRiskCapitals: Record<string, number> = {};
  for (const id of [...new Set(strategyIds)].sort()) strategyRiskCapitals[id] = perStrategy;
  const rationale: string[] = [`regime_multiplier:${regimeMultiplier.toFixed(4)}`, `cash_reserve:${cashReserve.toFixed(2)}`];
  if (regimeMultiplier < 1) rationale.push('regime_reduced_risk_budget');
  return { availableGrossRiskCapital: gross, availableNetRiskCapital: net, strategyRiskCapitals, regimeMultiplier, cashReserve, rationale };
}


export interface RiskBudgetOrderCheck {
  ok: boolean;
  reasons: string[];
  notional: number;
  projectedGrossExposure: number;
  projectedNetExposure: number;
  strategyRiskCapital?: number;
}

export function checkRiskBudgetOrder(input: {
  allocation: RiskBudgetAllocation;
  side: 'buy' | 'sell';
  qty: number;
  price: number;
  positions: Record<string, { qty: number; avgPrice: number }>;
  marks?: Record<string, number>;
  symbol: string;
  strategyId?: string;
  currentCash?: number;
}): RiskBudgetOrderCheck {
  const reasons: string[] = [];
  const notional = Math.abs(input.qty * input.price);
  if (!Number.isFinite(notional) || notional <= 0) {
    return { ok: false, reasons: ['risk_budget_invalid_notional'], notional, projectedGrossExposure: Number.NaN, projectedNetExposure: Number.NaN };
  }

  const signedOrder = (input.side === 'buy' ? 1 : -1) * Math.abs(input.qty);
  let projectedGrossExposure = 0;
  let projectedNetExposure = 0;
  for (const [symbol, position] of Object.entries(input.positions)) {
    const px = symbol === input.symbol ? input.price : (input.marks?.[symbol] ?? position.avgPrice);
    if (!Number.isFinite(px) || px <= 0 || !Number.isFinite(position.qty)) continue;
    const projectedQty = symbol === input.symbol ? position.qty + signedOrder : position.qty;
    projectedGrossExposure += Math.abs(projectedQty * px);
    projectedNetExposure += projectedQty * px;
  }
  if (!(input.symbol in input.positions)) {
    projectedGrossExposure += Math.abs(signedOrder * input.price);
    projectedNetExposure += signedOrder * input.price;
  }

  if (projectedGrossExposure > input.allocation.availableGrossRiskCapital + 1e-9) reasons.push('risk_budget_gross_exposure_exceeded');
  if (Math.abs(projectedNetExposure) > input.allocation.availableNetRiskCapital + 1e-9) reasons.push('risk_budget_net_exposure_exceeded');
  if (input.currentCash !== undefined && input.side === 'buy' && input.currentCash - notional < input.allocation.cashReserve - 1e-9) reasons.push('risk_budget_cash_reserve_exceeded');

  const strategyRiskCapital = input.strategyId ? input.allocation.strategyRiskCapitals[input.strategyId] : undefined;
  if (strategyRiskCapital !== undefined && notional > strategyRiskCapital + 1e-9) {
    reasons.push('risk_budget_strategy_cap_exceeded');
  }

  return { ok: reasons.length === 0, reasons, notional, projectedGrossExposure, projectedNetExposure, strategyRiskCapital };
}

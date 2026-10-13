export type ObservationRegime = 'trend' | 'range' | 'high-vol' | 'liquidity-stress' | string;

export interface PaperObservationCycle {
  cycleId: string;
  regime: ObservationRegime;
  tradeCount: number;
  netPnl: number;
  maxDrawdown: number;
  slippageBps: number;
  healthStatus: 'healthy' | 'degraded' | 'halted';
  reconciliationHash: string | null;
}

export interface PaperObservationPolicy {
  minCycles: number;
  minTrades: number;
  minNetPnl: number;
  requiredRegimes: string[];
  maxDrawdown: number;
  maxSlippageBps: number;
  allowDegradedCycles: boolean;
}

export interface PaperObservationResult {
  status: 'qualified' | 'blocked';
  cycleCount: number;
  totalTrades: number;
  netPnl: number;
  worstDrawdown: number;
  avgSlippageBps: number;
  observedRegimes: string[];
  reasons: string[];
}

export function evaluatePaperObservation(cycles: PaperObservationCycle[], policy: PaperObservationPolicy): PaperObservationResult {
  const reasons: string[] = [];
  const totalTrades = cycles.reduce((sum, c) => sum + c.tradeCount, 0);
  const netPnl = cycles.reduce((sum, c) => sum + c.netPnl, 0);
  const worstDrawdown = cycles.reduce((max, c) => Math.max(max, c.maxDrawdown), 0);
  const avgSlippageBps = cycles.length ? cycles.reduce((sum, c) => sum + c.slippageBps, 0) / cycles.length : 0;
  const observedRegimes = [...new Set(cycles.map((c) => c.regime))].sort();
  if (cycles.length < policy.minCycles) reasons.push('paper_observation_cycle_count_below_minimum');
  if (totalTrades < policy.minTrades) reasons.push('paper_observation_trade_count_below_minimum');
  if (!Number.isFinite(netPnl) || netPnl < policy.minNetPnl) reasons.push('paper_observation_net_pnl_below_minimum');
  for (const regime of policy.requiredRegimes) if (!observedRegimes.includes(regime)) reasons.push(`paper_observation_regime_missing:${regime}`);
  if (worstDrawdown > policy.maxDrawdown) reasons.push('paper_observation_drawdown_exceeded');
  if (avgSlippageBps > policy.maxSlippageBps) reasons.push('paper_observation_slippage_exceeded');
  if (cycles.some((c) => c.healthStatus === 'halted')) reasons.push('paper_observation_halted_cycle_present');
  if (!policy.allowDegradedCycles && cycles.some((c) => c.healthStatus === 'degraded')) reasons.push('paper_observation_degraded_cycle_present');
  if (cycles.some((c) => c.reconciliationHash === null)) reasons.push('paper_observation_reconciliation_missing');
  return { status: reasons.length ? 'blocked' : 'qualified', cycleCount: cycles.length, totalTrades, netPnl, worstDrawdown, avgSlippageBps, observedRegimes, reasons };
}

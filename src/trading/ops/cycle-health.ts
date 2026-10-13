import { createHash } from 'node:crypto';

export type CycleHealthStatus = 'healthy' | 'degraded' | 'halted';

export interface CycleHealthInput {
  cycleId: string;
  marketCount: number;
  freshQuoteRatio: number;
  quorumAgreementRatio: number;
  governanceStatus: 'reconciled' | 'fail_closed';
  closedLoopFailClosed: boolean;
  paperFillCount: number;
  paperNetPnl: number;
  watchdogStatus: 'normal' | 'degraded' | 'halted';
  reconciliationHash: string | null;
  authoritativeContextPresent?: boolean;
}

export interface CycleHealthResult {
  cycleId: string;
  status: CycleHealthStatus;
  reasons: string[];
  score: number;
  decisionHash: string;
}

function clamp(v: number): number { return Math.max(0, Math.min(1, v)); }

export function evaluateCycleHealth(input: CycleHealthInput): CycleHealthResult {
  if (!input.cycleId.trim()) throw new Error('invalid_cycle_id');
  if (!Number.isInteger(input.marketCount) || input.marketCount < 0) throw new Error('invalid_market_count');
  if (!Number.isFinite(input.paperFillCount) || input.paperFillCount < 0) throw new Error('invalid_fill_count');
  const reasons: string[] = [];
  const authoritativeContextPresent = input.authoritativeContextPresent !== false;
  if (!authoritativeContextPresent) reasons.push('missing_authoritative_health_context');
  const components = [
    clamp(input.marketCount / 1000),
    clamp(input.freshQuoteRatio),
    clamp(input.quorumAgreementRatio),
    input.governanceStatus === 'reconciled' ? 1 : 0,
    input.closedLoopFailClosed ? 0 : 1,
    input.watchdogStatus === 'normal' ? 1 : input.watchdogStatus === 'degraded' ? 0.5 : 0,
  ];
  const score = components.reduce((a, b) => a + b, 0) / components.length;
  if (input.marketCount < 1000) reasons.push('market_universe_incomplete');
  if (input.freshQuoteRatio < 0.98) reasons.push('quote_freshness_below_threshold');
  if (input.quorumAgreementRatio < 0.9) reasons.push('data_quorum_disagreement');
  if (input.governanceStatus !== 'reconciled') reasons.push('governance_not_reconciled');
  if (input.closedLoopFailClosed) reasons.push('closed_loop_fail_closed');
  if (input.watchdogStatus !== 'normal') reasons.push(`watchdog_${input.watchdogStatus}`);
  if (!input.reconciliationHash) reasons.push('reconciliation_hash_missing');

  let status: CycleHealthStatus = 'healthy';
  if (!authoritativeContextPresent || input.governanceStatus === 'fail_closed' || input.closedLoopFailClosed || input.watchdogStatus === 'halted' || !input.reconciliationHash) status = 'halted';
  else if (reasons.length > 0 || score < 0.9) status = 'degraded';

  const decisionHash = createHash('sha256').update(JSON.stringify({
    cycleId: input.cycleId,
    status,
    reasons: [...reasons].sort(),
    score: Number(score.toFixed(8)),
    reconciliationHash: input.reconciliationHash,
  })).digest('hex');
  return { cycleId: input.cycleId, status, reasons, score, decisionHash };
}

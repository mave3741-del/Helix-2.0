import { createHash } from 'node:crypto';
import { closedLoopDecisionHash, type ClosedLoopCycleResult } from './learning/closed-loop.ts';
import type { ChampionChallengerDecision } from './champion-challenger.ts';
import type { EnsembleAllocation } from './portfolio-ensemble.ts';

export interface ChampionPortfolioReconciliationInput {
  reconciliationId: string;
  cycle: ClosedLoopCycleResult;
  championDecision: ChampionChallengerDecision | null;
  governanceRunId: string;
  portfolioAllocations: EnsembleAllocation[];
}

export interface ChampionPortfolioReconciliationResult {
  closedLoopDecisionHash: string;
  championDecisionHash: string | null;
  reconciliationId: string;
  cycleId: string;
  championStrategyId: string | null;
  portfolioStrategyIds: string[];
  governanceRunId: string;
  status: 'reconciled' | 'fail_closed';
  reasons: string[];
  decisionHash: string;
}

function canonical(value: unknown): string {
  return JSON.stringify(value);
}

export function reconcileChampionPortfolio(input: ChampionPortfolioReconciliationInput): ChampionPortfolioReconciliationResult {
  if (!input.reconciliationId.trim() || !input.cycle.cycleId.trim() || !input.governanceRunId.trim()) {
    throw new Error('invalid_reconciliation_identity');
  }
  const reasons: string[] = [];
  const championId = input.cycle.championId;
  const portfolioIds = input.portfolioAllocations.map((x) => x.strategyId).sort();
  const weights = input.portfolioAllocations.map((x) => x.weight);
  const invalidAllocation = input.portfolioAllocations.some((x) => !Number.isFinite(x.weight) || x.weight < 0 || x.weight > 1 || !Number.isFinite(x.score));
  const allocationTotal = weights.reduce((sum, weight) => sum + weight, 0);

  if (input.cycle.failClosed) reasons.push('closed_loop_fail_closed');
  if (!input.championDecision) reasons.push('champion_decision_missing');
  if (input.championDecision?.promote && championId === null) reasons.push('promotion_without_champion');
  if (input.championDecision?.promote && championId && !portfolioIds.includes(championId)) reasons.push('promoted_champion_missing_from_portfolio');
  if (championId && input.portfolioAllocations.length === 0) reasons.push('champion_without_portfolio_allocation');
  if (new Set(portfolioIds).size !== portfolioIds.length) reasons.push('duplicate_portfolio_strategy');
  if (invalidAllocation) reasons.push('portfolio_allocation_invalid');
  if (portfolioIds.length > 0 && Math.abs(allocationTotal - 1) > 1e-6) reasons.push('portfolio_allocation_not_normalized');

  const status = reasons.length ? 'fail_closed' : 'reconciled';
  const upstreamClosedLoopDecisionHash = closedLoopDecisionHash(input.cycle);
  const upstreamChampionDecisionHash = input.championDecision ? createHash('sha256').update(canonical(input.championDecision)).digest('hex') : null;
  const hashInput = {
    reconciliationId: input.reconciliationId,
    cycleId: input.cycle.cycleId,
    championStrategyId: championId,
    portfolioStrategyIds: portfolioIds,
    governanceRunId: input.governanceRunId,
    closedLoopDecisionHash: upstreamClosedLoopDecisionHash,
    championDecisionHash: upstreamChampionDecisionHash,
    championDecision: input.championDecision,
    status,
    reasons,
  };
  const decisionHash = createHash('sha256').update(canonical(hashInput)).digest('hex');
  return { reconciliationId: input.reconciliationId, cycleId: input.cycle.cycleId, championStrategyId: championId, portfolioStrategyIds: portfolioIds, governanceRunId: input.governanceRunId, closedLoopDecisionHash: upstreamClosedLoopDecisionHash, championDecisionHash: upstreamChampionDecisionHash, status, reasons, decisionHash };
}

export interface ChampionPortfolioReconciliationStore {
  save(result: ChampionPortfolioReconciliationResult): Promise<void>;
}

export class SqlChampionPortfolioReconciliationStore implements ChampionPortfolioReconciliationStore {
  private sqlPromise: Promise<{ query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]> }> | null = null;
  private sql() {
    this.sqlPromise ??= import('../lib/db.ts').then(({ getSql }) => getSql());
    return this.sqlPromise;
  }
  async save(result: ChampionPortfolioReconciliationResult): Promise<void> {
    const sql = await this.sql();
    const cycleRows = await sql.query<{ cycle_id: string }>('select cycle_id from trading_closed_loop_cycles where cycle_id=$1', [result.cycleId]);
    if (!cycleRows.length) throw new Error('closed_loop_cycle_missing_for_reconciliation');
    const governanceRows = await sql.query<{ run_id: string; cycle_id: string }>('select run_id, cycle_id from trading_portfolio_governance_runs where run_id=$1 and cycle_id=$2', [result.governanceRunId, result.cycleId]);
    if (!governanceRows.length) throw new Error('governance_run_missing_or_cycle_mismatch');
    await sql.query(`insert into trading_champion_portfolio_reconciliations
      (reconciliation_id, cycle_id, as_of_ts, champion_strategy_id, portfolio_strategy_ids, closed_loop_decision_hash, champion_decision_hash, governance_run_id, status, reasons, decision_hash)
      values ($1,(select as_of_ts from trading_closed_loop_cycles where cycle_id=$2),$3,$4,$5::jsonb,$6,$7,$8,$9,$10::jsonb,$11)
      on conflict (reconciliation_id) do nothing`, [result.reconciliationId, result.cycleId, new Date(), result.championStrategyId, JSON.stringify(result.portfolioStrategyIds), result.closedLoopDecisionHash, result.championDecisionHash, result.governanceRunId, result.status, JSON.stringify(result.reasons), result.decisionHash]);
  }
}

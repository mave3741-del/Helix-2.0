import { createHash } from 'node:crypto';
import { buildPerformanceSnapshot, type PaperTradeAttribution } from '../post-trade.ts';
import {
  allocateEnsemble,
  chooseChampionChallenger,
  type EnsembleAllocation,
  type StrategyExperimentSnapshot as EnsembleSnapshot,
  type PerformanceAttribution,
} from '../portfolio-ensemble.ts';

export interface StrategyLearningProfile {
  strategyId: string;
  experimentId: string;
  expectedReturn: number;
  volatility: number;
  sharpe: number;
  robustness: number;
  turnover: number;
  correlationToPortfolio: number;
  status: EnsembleSnapshot['status'];
}

export interface ClosedLoopPolicy {
  minTrades: number;
  maxDrawdown: number;
  minRobustness: number;
  maxStrategies: number;
  maxWeight: number;
  minWeight: number;
  retireAfterNegativeCycles: number;
}

export interface StrategyCycleState {
  strategyId: string;
  negativeCycles: number;
}

export interface ClosedLoopCycleInput {
  cycleId: string;
  asOfTs: number;
  trades: PaperTradeAttribution[];
  profiles: StrategyLearningProfile[];
  realizedReturns?: Record<string, number>;
  realizedRisk?: Record<string, number>;
  priorState?: StrategyCycleState[];
}

export interface StrategyLearningDecision {
  strategyId: string;
  action: 'maintain' | 'increase' | 'decrease' | 'retire';
  reason: string;
  weight: number;
  negativeCycles: number;
}

export interface ClosedLoopCycleResult {
  cycleId: string;
  asOfTs: number;
  snapshots: Awaited<ReturnType<typeof buildPerformanceSnapshot>>[];
  allocations: EnsembleAllocation[];
  attribution: PerformanceAttribution[];
  championId: string | null;
  challengerIds: string[];
  decisions: StrategyLearningDecision[];
  failClosed: boolean;
  reasons: string[];
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export async function runClosedLoopCycle(input: ClosedLoopCycleInput, policy: ClosedLoopPolicy): Promise<ClosedLoopCycleResult> {
  if (!Number.isFinite(input.asOfTs) || input.asOfTs <= 0) throw new Error('invalid_cycle_timestamp');
  if (policy.minTrades < 1 || policy.maxStrategies < 1 || policy.maxWeight <= 0 || policy.maxWeight > 1) throw new Error('invalid_learning_policy');

  const snapshots = [] as ClosedLoopCycleResult['snapshots'];
  const profileMap = new Map(input.profiles.map((profile) => [profile.strategyId, profile]));
  const decisionReasons: string[] = [];

  for (const profile of input.profiles) {
    const snapshot = await buildPerformanceSnapshot(profile.strategyId, input.trades, input.asOfTs);
    snapshots.push(snapshot);
  }

  const candidates: EnsembleSnapshot[] = snapshots.map((snapshot) => {
    const profile = profileMap.get(snapshot.strategyId)!;
    const annualizedProxy = snapshot.tradeCount > 1 ? snapshot.avgTradePnl * Math.sqrt(snapshot.tradeCount) : snapshot.avgTradePnl;
    const volatility = profile.volatility > 0 ? profile.volatility : Math.max(1e-9, Math.abs(snapshot.avgTradePnl));
    return {
      strategyId: profile.strategyId,
      experimentId: profile.experimentId,
      expectedReturn: profile.expectedReturn || snapshot.avgTradePnl,
      volatility,
      maxDrawdown: snapshot.tradeCount ? snapshot.maxDrawdown : Infinity,
      sharpe: profile.sharpe || (annualizedProxy / volatility),
      robustness: profile.robustness,
      paperReturn: snapshot.netPnl,
      turnover: profile.turnover,
      correlationToPortfolio: profile.correlationToPortfolio,
      status: profile.status,
    };
  });

  const eligible = candidates.filter((item) => {
    const snapshot = snapshots.find((x) => x.strategyId === item.strategyId)!;
    return snapshot.tradeCount >= policy.minTrades
      && item.maxDrawdown <= policy.maxDrawdown
      && item.robustness >= policy.minRobustness
      && item.status !== 'retired';
  });
  if (!eligible.length) return {
    cycleId: input.cycleId,
    asOfTs: input.asOfTs,
    snapshots,
    allocations: [],
    attribution: [],
    championId: null,
    challengerIds: [],
    decisions: input.profiles.map((p) => ({ strategyId:p.strategyId, action:'retire', reason:'no_strategy_passed_closed_loop_gates', weight:0, negativeCycles:(input.priorState?.find((s)=>s.strategyId===p.strategyId)?.negativeCycles ?? 0)+1 })),
    failClosed: true,
    reasons: ['no_strategy_passed_closed_loop_gates'],
  };

  const governed = eligible.map((item) => ({
    ...item,
    correlationToPortfolio: clamp(item.correlationToPortfolio, -1, 1),
  }));
  const rawAllocations = allocateEnsemble(governed, policy.maxStrategies);
  const capped = rawAllocations.map((allocation) => ({ ...allocation, weight: Math.min(allocation.weight, policy.maxWeight) }));
  let weightTotal = capped.reduce((sum, item) => sum + item.weight, 0);
  if (weightTotal <= 0) return { cycleId:input.cycleId, asOfTs:input.asOfTs, snapshots, allocations:[], attribution:[], championId:null, challengerIds:[], decisions:[], failClosed:true, reasons:['allocation_zero'] };

  const rebased = capped.map((item) => ({ ...item, weight: item.weight / weightTotal }));
  if (rebased.some((item) => item.weight < policy.minWeight)) {
    decisionReasons.push('allocation_below_min_weight_filtered');
    const filtered = rebased.filter((item) => item.weight >= policy.minWeight);
    weightTotal = filtered.reduce((sum, item) => sum + item.weight, 0);
    rebased.splice(0, rebased.length, ...filtered.map((item) => ({ ...item, weight: item.weight / weightTotal })));
  }

  const realizedReturns = input.realizedReturns ?? {};
  const realizedRisk = input.realizedRisk ?? {};
  const attribution = rebased.map((a) => {
    const ret = realizedReturns[a.strategyId] ?? 0;
    const risk = realizedRisk[a.strategyId] ?? 0;
    const ensembleReturn = rebased.reduce((sum, x) => sum + (realizedReturns[x.strategyId] ?? 0) * x.weight, 0);
    return { strategyId:a.strategyId, contribution:ret*a.weight, riskContribution:risk*a.weight, excessVsEnsemble:(ret*a.weight) - ensembleReturn*a.weight };
  });
  const { champion, challengers } = chooseChampionChallenger(governed, policy.minRobustness);
  const prior = new Map((input.priorState ?? []).map((state) => [state.strategyId, state.negativeCycles]));
  const allocationsById = new Map(rebased.map((a) => [a.strategyId, a.weight]));
  const decisions = input.profiles.map((profile) => {
    const snapshot = snapshots.find((item) => item.strategyId === profile.strategyId)!;
    const priorNegative = prior.get(profile.strategyId) ?? 0;
    const currentNegative = snapshot.netPnl < 0 ? priorNegative + 1 : 0;
    const weight = allocationsById.get(profile.strategyId) ?? 0;
    let action: StrategyLearningDecision['action'] = 'maintain';
    let reason = 'within_governance_band';
    if (currentNegative >= policy.retireAfterNegativeCycles) { action = 'retire'; reason = 'repeated_negative_closed_loop_cycles'; }
    else if (weight > 0.25) { action = 'increase'; reason = 'high_governance_weight'; }
    else if (weight > 0 && weight < 0.1) { action = 'decrease'; reason = 'low_governance_weight'; }
    else if (!allocationsById.has(profile.strategyId)) { action = 'decrease'; reason = 'excluded_from_current_ensemble'; }
    return { strategyId:profile.strategyId, action, reason, weight, negativeCycles:currentNegative };
  });

  const failClosed = decisions.some((d) => d.action === 'retire' && d.strategyId === champion?.strategyId);
  if (failClosed) decisionReasons.push('current_champion_failed_retirement_guard');

  return { cycleId:input.cycleId, asOfTs:input.asOfTs, snapshots, allocations:rebased, attribution, championId:champion?.strategyId ?? null, challengerIds:challengers.map((x)=>x.strategyId), decisions, failClosed, reasons:decisionReasons };
}

export interface ClosedLoopStore { save(result: ClosedLoopCycleResult): Promise<void>; latest(): Promise<ClosedLoopCycleResult | null>; }

export function closedLoopDecisionHash(result: ClosedLoopCycleResult): string {
  const payload = JSON.stringify({ cycleId: result.cycleId, asOfTs: result.asOfTs, championId: result.championId, challengerIds: result.challengerIds, allocations: result.allocations, attribution: result.attribution, decisions: result.decisions, failClosed: result.failClosed, reasons: result.reasons });
  return createHash('sha256').update(payload).digest('hex');
}

export class InMemoryClosedLoopStore implements ClosedLoopStore {
  private latestResult: ClosedLoopCycleResult | null = null;
  async save(result: ClosedLoopCycleResult) { this.latestResult = structuredClone(result); }
  async latest() { return this.latestResult ? structuredClone(this.latestResult) : null; }
}

interface SqlLike { query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>; }

export class SqlClosedLoopStore implements ClosedLoopStore {
  private sqlPromise: Promise<SqlLike> | null = null;
  private sql(): Promise<SqlLike> {
    this.sqlPromise ??= import('../../lib/db.ts').then(({ getSql }) => getSql());
    return this.sqlPromise;
  }
  async save(result: ClosedLoopCycleResult) {
    const sql = await this.sql();
    const decisionHash = closedLoopDecisionHash(result);
    await sql.query(
      `insert into trading_closed_loop_cycles
       (cycle_id, as_of_ts, champion_strategy_id, challenger_strategy_ids, allocations, attribution, decisions, fail_closed, reasons, decision_hash)
       values ($1,to_timestamp($2/1000.0),$3,$4::jsonb,$5::jsonb,$6::jsonb,$7::jsonb,$8,$9::jsonb,$10)
       on conflict (cycle_id) do nothing`,
      [result.cycleId, result.asOfTs, result.championId, JSON.stringify(result.challengerIds), JSON.stringify(result.allocations), JSON.stringify(result.attribution), JSON.stringify(result.decisions), result.failClosed, JSON.stringify(result.reasons), decisionHash],
    );
  }
  async latest() {
    const sql = await this.sql();
    const rows = await sql.query<Record<string, unknown>>(`select cycle_id, extract(epoch from as_of_ts)*1000 as as_of_ms, champion_strategy_id, challenger_strategy_ids, allocations, attribution, decisions, fail_closed, reasons, decision_hash from trading_closed_loop_cycles order by as_of_ts desc limit 1`);
    const row = rows[0];
    if (!row) return null;
    const parse = <T>(value: unknown, fallback: T): T => typeof value === 'string' ? JSON.parse(value) as T : (value as T ?? fallback);
    return {
      cycleId:String(row.cycle_id), asOfTs:Number(row.as_of_ms), championId:row.champion_strategy_id ? String(row.champion_strategy_id) : null,
      challengerIds:parse<string[]>(row.challenger_strategy_ids, []), allocations:parse<EnsembleAllocation[]>(row.allocations, []), attribution:parse<PerformanceAttribution[]>(row.attribution, []),
      decisions:parse<StrategyLearningDecision[]>(row.decisions, []), snapshots:[], failClosed:Boolean(row.fail_closed), reasons:parse<string[]>(row.reasons, []),
    };
  }
}

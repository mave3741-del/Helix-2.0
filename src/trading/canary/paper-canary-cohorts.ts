import { createHash } from 'node:crypto';
import type { PaperOperationSnapshot } from '../ops/paper-operations.ts';

export interface PaperCanaryCohortPolicy {
  minimumObservationCycles: number;
  minimumTrades: number;
  maximumObservationWindowMs: number;
  maximumRejectedOrderRate: number;
  maximumReconciliationMismatches: number;
  maximumCriticalAlerts: number;
  maximumP95LatencyMs: number;
  maximumDrawdown: number;
  maximumAverageSlippageBps: number;
  requiredRegimes: string[];
  allowDegradedCycles: boolean;
}

export const DEFAULT_PAPER_CANARY_COHORT_POLICY: PaperCanaryCohortPolicy = {
  minimumObservationCycles: 20,
  minimumTrades: 40,
  maximumObservationWindowMs: 24 * 60 * 60 * 1000,
  maximumRejectedOrderRate: 0.10,
  maximumReconciliationMismatches: 0,
  maximumCriticalAlerts: 0,
  maximumP95LatencyMs: 2_000,
  maximumDrawdown: 100,
  maximumAverageSlippageBps: 20,
  requiredRegimes: [],
  allowDegradedCycles: true,
};

export interface PaperCanaryCohortDefinition {
  cohortId: string;
  label: string;
  sessionIds: string[];
  strategyIds: string[];
  windowStartMs: number;
  windowEndMs: number;
  policy?: Partial<PaperCanaryCohortPolicy>;
}

export interface PaperCanaryCohortAdmission {
  allowed: boolean;
  cohortId: string;
  reasons: string[];
  attestationHash: string;
}

export interface PaperCanaryCohortObservation {
  observationId: string;
  cohortId: string;
  sessionId: string;
  cycleId: string;
  observedAtMs: number;
  regime: string;
  tradeCount: number;
  rejectedOrders: number;
  reconciliationMismatches: number;
  criticalAlerts: number;
  p95LatencyMs: number;
  netPnl: number;
  maxDrawdown: number;
  slippageBps: number;
  healthStatus: 'healthy' | 'degraded' | 'halted';
  reconciliationHash: string | null;
}

export interface PaperCanaryCohortResult {
  status: 'qualified' | 'blocked';
  cohortId: string;
  label: string;
  windowStartMs: number;
  windowEndMs: number;
  observationCount: number;
  totalTrades: number;
  totalRejectedOrders: number;
  rejectionRate: number;
  reconciliationMismatches: number;
  criticalAlerts: number;
  maxP95LatencyMs: number;
  netPnl: number;
  worstDrawdown: number;
  averageSlippageBps: number;
  observedRegimes: string[];
  reasons: string[];
  evidenceHash: string;
}

export interface PaperCanaryComparisonEvidence {
  comparisonId: string;
  status: 'comparable' | 'blocked';
  cohortIds: string[];
  ranking: string[];
  metricDeltas: Array<{
    cohortA: string;
    cohortB: string;
    netPnlDelta: number;
    drawdownDelta: number;
    rejectionRateDelta: number;
    slippageDelta: number;
    latencyDelta: number;
  }>;
  reasons: string[];
  evidenceHash: string;
}

function sha256(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function mergedPolicy(policy?: Partial<PaperCanaryCohortPolicy>): PaperCanaryCohortPolicy {
  const merged = { ...DEFAULT_PAPER_CANARY_COHORT_POLICY, ...(policy ?? {}) };
  merged.requiredRegimes = [...new Set(merged.requiredRegimes)].sort();
  return merged;
}

function validateDefinition(definition: PaperCanaryCohortDefinition, policy: PaperCanaryCohortPolicy): string[] {
  const reasons: string[] = [];
  if (!definition.cohortId.trim()) reasons.push('cohort_id_required');
  if (!definition.label.trim()) reasons.push('cohort_label_required');
  if (!definition.sessionIds.length) reasons.push('cohort_session_required');
  if (new Set(definition.sessionIds).size !== definition.sessionIds.length) reasons.push('cohort_session_ids_must_be_unique');
  if (!definition.strategyIds.length) reasons.push('cohort_strategy_required');
  if (new Set(definition.strategyIds).size !== definition.strategyIds.length) reasons.push('cohort_strategy_ids_must_be_unique');
  if (!Number.isInteger(definition.windowStartMs) || !Number.isInteger(definition.windowEndMs) || definition.windowEndMs <= definition.windowStartMs) reasons.push('cohort_observation_window_invalid');
  const duration = definition.windowEndMs - definition.windowStartMs;
  if (duration > policy.maximumObservationWindowMs) reasons.push('cohort_observation_window_exceeds_policy');
  if (policy.minimumObservationCycles <= 0) reasons.push('cohort_minimum_cycles_invalid');
  if (policy.minimumTrades < 0) reasons.push('cohort_minimum_trades_invalid');
  if (policy.maximumRejectedOrderRate < 0 || policy.maximumRejectedOrderRate > 1) reasons.push('cohort_rejection_policy_invalid');
  if (policy.maximumReconciliationMismatches < 0 || policy.maximumCriticalAlerts < 0) reasons.push('cohort_count_policy_invalid');
  if (policy.maximumP95LatencyMs <= 0 || policy.maximumDrawdown < 0 || policy.maximumAverageSlippageBps < 0) reasons.push('cohort_metric_policy_invalid');
  return reasons;
}

export function admitPaperCanaryCohort(
  definition: PaperCanaryCohortDefinition,
  sessions: PaperOperationSnapshot[],
  ownerCapitalApprovalActive: boolean,
  liveExecutionEnabled: boolean,
): PaperCanaryCohortAdmission {
  const policy = mergedPolicy(definition.policy);
  const reasons = validateDefinition(definition, policy);
  if (!ownerCapitalApprovalActive) reasons.push('cohort_owner_capital_approval_required');
  if (liveExecutionEnabled) reasons.push('cohort_live_execution_forbidden');

  const sessionById = new Map(sessions.map((session) => [session.sessionId, session]));
  for (const sessionId of definition.sessionIds) {
    const session = sessionById.get(sessionId);
    if (!session) {
      reasons.push(`cohort_session_missing:${sessionId}`);
      continue;
    }
    if (session.state !== 'running') reasons.push(`cohort_session_not_running:${sessionId}`);
    if (session.liveExecutionEnabled !== false) reasons.push(`cohort_session_not_paper_only:${sessionId}`);
  }

  const payload = {
    definition: { ...definition, policy },
    sessions: definition.sessionIds.map((id) => sessionById.get(id) ?? null),
    ownerCapitalApprovalActive,
    liveExecutionEnabled,
  };
  return {
    allowed: reasons.length === 0,
    cohortId: definition.cohortId,
    reasons: [...new Set(reasons)].sort(),
    attestationHash: sha256(payload),
  };
}

export function evaluatePaperCanaryCohort(
  definition: PaperCanaryCohortDefinition,
  observations: PaperCanaryCohortObservation[],
): PaperCanaryCohortResult {
  const policy = mergedPolicy(definition.policy);
  const reasons = validateDefinition(definition, policy);
  const scoped = observations
    .filter((observation) => observation.cohortId === definition.cohortId)
    .filter((observation) => observation.observedAtMs >= definition.windowStartMs && observation.observedAtMs <= definition.windowEndMs)
    .sort((a, b) => a.observedAtMs - b.observedAtMs || a.cycleId.localeCompare(b.cycleId));

  const declaredSessions = new Set(definition.sessionIds);
  const uniqueCycles = new Set<string>();
  for (const observation of scoped) {
    if (!declaredSessions.has(observation.sessionId)) reasons.push(`cohort_observation_session_not_declared:${observation.sessionId}`);
    const cycleKey = `${observation.sessionId}:${observation.cycleId}`;
    if (uniqueCycles.has(cycleKey)) reasons.push(`cohort_duplicate_cycle:${cycleKey}`);
    uniqueCycles.add(cycleKey);
    if (!Number.isFinite(observation.netPnl) || !Number.isFinite(observation.maxDrawdown) || !Number.isFinite(observation.slippageBps)) reasons.push(`cohort_invalid_numeric_observation:${observation.observationId}`);
    if (observation.tradeCount < 0 || observation.rejectedOrders < 0 || observation.reconciliationMismatches < 0 || observation.criticalAlerts < 0) reasons.push(`cohort_negative_count_observation:${observation.observationId}`);
  }

  if (scoped.length < policy.minimumObservationCycles) reasons.push('cohort_observation_cycles_below_minimum');
  const totalTrades = scoped.reduce((sum, item) => sum + item.tradeCount, 0);
  const totalRejectedOrders = scoped.reduce((sum, item) => sum + item.rejectedOrders, 0);
  const rejectionRate = totalTrades + totalRejectedOrders > 0 ? totalRejectedOrders / (totalTrades + totalRejectedOrders) : 1;
  const reconciliationMismatches = scoped.reduce((sum, item) => sum + item.reconciliationMismatches, 0);
  const criticalAlerts = scoped.reduce((sum, item) => sum + item.criticalAlerts, 0);
  const maxP95LatencyMs = scoped.reduce((max, item) => Math.max(max, item.p95LatencyMs), 0);
  const netPnl = scoped.reduce((sum, item) => sum + item.netPnl, 0);
  const worstDrawdown = scoped.reduce((max, item) => Math.max(max, item.maxDrawdown), 0);
  const averageSlippageBps = scoped.length ? scoped.reduce((sum, item) => sum + item.slippageBps, 0) / scoped.length : 0;
  const observedRegimes = [...new Set(scoped.map((item) => item.regime))].sort();

  if (totalTrades < policy.minimumTrades) reasons.push('cohort_trade_count_below_minimum');
  if (rejectionRate > policy.maximumRejectedOrderRate) reasons.push('cohort_rejection_rate_exceeded');
  if (reconciliationMismatches > policy.maximumReconciliationMismatches) reasons.push('cohort_reconciliation_mismatch');
  if (criticalAlerts > policy.maximumCriticalAlerts) reasons.push('cohort_critical_alerts_present');
  if (maxP95LatencyMs > policy.maximumP95LatencyMs) reasons.push('cohort_latency_exceeded');
  if (worstDrawdown > policy.maximumDrawdown) reasons.push('cohort_drawdown_exceeded');
  if (averageSlippageBps > policy.maximumAverageSlippageBps) reasons.push('cohort_slippage_exceeded');
  for (const regime of policy.requiredRegimes) if (!observedRegimes.includes(regime)) reasons.push(`cohort_regime_missing:${regime}`);
  if (scoped.some((item) => item.healthStatus === 'halted')) reasons.push('cohort_halted_cycle_present');
  if (!policy.allowDegradedCycles && scoped.some((item) => item.healthStatus === 'degraded')) reasons.push('cohort_degraded_cycle_present');
  if (scoped.some((item) => item.reconciliationHash === null)) reasons.push('cohort_reconciliation_missing');

  const payload = {
    definition: { ...definition, policy },
    observations: scoped,
    status: reasons.length ? 'blocked' : 'qualified',
    metrics: { totalTrades, totalRejectedOrders, rejectionRate, reconciliationMismatches, criticalAlerts, maxP95LatencyMs, netPnl, worstDrawdown, averageSlippageBps, observedRegimes },
    reasons: [...new Set(reasons)].sort(),
  };
  return {
    status: reasons.length ? 'blocked' : 'qualified',
    cohortId: definition.cohortId,
    label: definition.label,
    windowStartMs: definition.windowStartMs,
    windowEndMs: definition.windowEndMs,
    observationCount: scoped.length,
    totalTrades,
    totalRejectedOrders,
    rejectionRate,
    reconciliationMismatches,
    criticalAlerts,
    maxP95LatencyMs,
    netPnl,
    worstDrawdown,
    averageSlippageBps,
    observedRegimes,
    reasons: [...new Set(reasons)].sort(),
    evidenceHash: sha256(payload),
  };
}

function comparisonTuple(result: PaperCanaryCohortResult): [number, number, number, number, number, number, string] {
  return [
    result.reconciliationMismatches,
    result.criticalAlerts,
    result.rejectionRate,
    result.worstDrawdown,
    result.averageSlippageBps,
    -result.netPnl,
    result.cohortId,
  ];
}

function compareTuple(a: [number, number, number, number, number, number, string], b: [number, number, number, number, number, number, string]): number {
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] < b[index]) return -1;
    if (a[index] > b[index]) return 1;
  }
  return 0;
}

export function comparePaperCanaryCohorts(results: PaperCanaryCohortResult[]): PaperCanaryComparisonEvidence {
  const cohortIds = [...new Set(results.map((result) => result.cohortId))].sort();
  const reasons: string[] = [];
  if (cohortIds.length < 2) reasons.push('cohort_comparison_requires_two_cohorts');
  if (results.some((result) => result.status !== 'qualified')) reasons.push('cohort_comparison_requires_all_cohorts_qualified');
  if (results.length > 1) {
    const [first] = results;
    if (results.some((result) => result.windowStartMs !== first.windowStartMs || result.windowEndMs !== first.windowEndMs)) reasons.push('cohort_comparison_windows_must_match');
  }

  const ranking = [...results].sort((a, b) => compareTuple(comparisonTuple(a), comparisonTuple(b))).map((result) => result.cohortId);
  const metricDeltas: PaperCanaryComparisonEvidence['metricDeltas'] = [];
  for (let i = 0; i < results.length; i += 1) {
    for (let j = i + 1; j < results.length; j += 1) {
      const a = results[i];
      const b = results[j];
      metricDeltas.push({
        cohortA: a.cohortId,
        cohortB: b.cohortId,
        netPnlDelta: a.netPnl - b.netPnl,
        drawdownDelta: a.worstDrawdown - b.worstDrawdown,
        rejectionRateDelta: a.rejectionRate - b.rejectionRate,
        slippageDelta: a.averageSlippageBps - b.averageSlippageBps,
        latencyDelta: a.maxP95LatencyMs - b.maxP95LatencyMs,
      });
    }
  }
  metricDeltas.sort((a, b) => `${a.cohortA}:${a.cohortB}`.localeCompare(`${b.cohortA}:${b.cohortB}`));
  const payload = { cohortIds, ranking, metricDeltas, reasons: [...new Set(reasons)].sort() };
  return {
    comparisonId: `canary-comparison:${sha256(cohortIds).slice(0, 24)}`,
    status: reasons.length ? 'blocked' : 'comparable',
    cohortIds,
    ranking,
    metricDeltas,
    reasons: [...new Set(reasons)].sort(),
    evidenceHash: sha256(payload),
  };
}

export interface PaperCanaryCohortStore {
  saveCohort(admission: PaperCanaryCohortAdmission, definition: PaperCanaryCohortDefinition, result?: PaperCanaryCohortResult): Promise<void>;
  saveObservation(observation: PaperCanaryCohortObservation): Promise<void>;
  saveComparison(comparison: PaperCanaryComparisonEvidence): Promise<void>;
  listObservations(cohortId: string): Promise<PaperCanaryCohortObservation[]>;
  loadCohortResult(cohortId: string): Promise<PaperCanaryCohortResult | null>;
}

export class InMemoryPaperCanaryCohortStore implements PaperCanaryCohortStore {
  private readonly cohorts = new Map<string, { admission: PaperCanaryCohortAdmission; definition: PaperCanaryCohortDefinition; result?: PaperCanaryCohortResult }>();
  private readonly observations = new Map<string, PaperCanaryCohortObservation>();
  private readonly comparisons = new Map<string, PaperCanaryComparisonEvidence>();

  async saveCohort(admission: PaperCanaryCohortAdmission, definition: PaperCanaryCohortDefinition, result?: PaperCanaryCohortResult): Promise<void> {
    this.cohorts.set(definition.cohortId, { admission: structuredClone(admission), definition: structuredClone(definition), result: result ? structuredClone(result) : undefined });
  }

  async saveObservation(observation: PaperCanaryCohortObservation): Promise<void> {
    if (!observation.observationId) throw new Error('cohort_observation_id_required');
    this.observations.set(observation.observationId, structuredClone(observation));
  }

  async saveComparison(comparison: PaperCanaryComparisonEvidence): Promise<void> {
    this.comparisons.set(comparison.comparisonId, structuredClone(comparison));
  }

  async listObservations(cohortId: string): Promise<PaperCanaryCohortObservation[]> {
    return [...this.observations.values()].filter((item) => item.cohortId === cohortId).sort((a, b) => a.observedAtMs - b.observedAtMs || a.cycleId.localeCompare(b.cycleId)).map((item) => structuredClone(item));
  }

  async loadCohortResult(cohortId: string): Promise<PaperCanaryCohortResult | null> {
    const result = this.cohorts.get(cohortId)?.result;
    return result ? structuredClone(result) : null;
  }
}

interface SqlLike { query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>; }

export class SqlPaperCanaryCohortStore implements PaperCanaryCohortStore {
  private sqlPromise: Promise<SqlLike> | null = null;
  private sql(): Promise<SqlLike> {
    this.sqlPromise ??= import('../../lib/db.ts').then(({ getSql }) => getSql());
    return this.sqlPromise;
  }

  async saveCohort(admission: PaperCanaryCohortAdmission, definition: PaperCanaryCohortDefinition, result?: PaperCanaryCohortResult): Promise<void> {
    const sql = await this.sql();
    const snapshot = { admission, definition, result: result ?? null };
    const snapshotHash = sha256(snapshot);
    await sql.query(
      `insert into trading_phase7_paper_canary_cohorts
        (cohort_id, state, snapshot, snapshot_hash, updated_at)
       values ($1,$2,$3::jsonb,$4,now())
       on conflict (cohort_id) do update set state=excluded.state, snapshot=excluded.snapshot, snapshot_hash=excluded.snapshot_hash, updated_at=now()`,
      [definition.cohortId, result?.status ?? (admission.allowed ? 'admitted' : 'blocked'), JSON.stringify(snapshot), snapshotHash],
    );
  }

  async saveObservation(observation: PaperCanaryCohortObservation): Promise<void> {
    const sql = await this.sql();
    await sql.query(
      `insert into trading_phase7_paper_canary_observations
        (observation_id, cohort_id, cycle_id, session_id, observed_at, observation)
       values ($1,$2,$3,$4,to_timestamp($5/1000.0),$6::jsonb)
       on conflict (cohort_id, cycle_id) do update set observation=excluded.observation, observed_at=excluded.observed_at, session_id=excluded.session_id`,
      [observation.observationId, observation.cohortId, observation.cycleId, observation.sessionId, observation.observedAtMs, JSON.stringify(observation)],
    );
  }

  async saveComparison(comparison: PaperCanaryComparisonEvidence): Promise<void> {
    const sql = await this.sql();
    await sql.query(
      `insert into trading_phase7_paper_canary_comparisons
        (comparison_id, comparison, evidence_hash, created_at)
       values ($1,$2::jsonb,$3,now())
       on conflict (comparison_id) do update set comparison=excluded.comparison, evidence_hash=excluded.evidence_hash`,
      [comparison.comparisonId, JSON.stringify(comparison), comparison.evidenceHash],
    );
  }

  async listObservations(cohortId: string): Promise<PaperCanaryCohortObservation[]> {
    const sql = await this.sql();
    const rows = await sql.query<Record<string, unknown>>(`select observation from trading_phase7_paper_canary_observations where cohort_id=$1 order by observed_at asc, cycle_id asc`, [cohortId]);
    return rows.map((row) => typeof row.observation === 'string' ? JSON.parse(row.observation) as PaperCanaryCohortObservation : row.observation as PaperCanaryCohortObservation);
  }

  async loadCohortResult(cohortId: string): Promise<PaperCanaryCohortResult | null> {
    const sql = await this.sql();
    const rows = await sql.query<Record<string, unknown>>(`select snapshot from trading_phase7_paper_canary_cohorts where cohort_id=$1`, [cohortId]);
    const row = rows[0];
    if (!row) return null;
    const snapshot = typeof row.snapshot === 'string' ? JSON.parse(row.snapshot) as { result?: PaperCanaryCohortResult | null } : row.snapshot as { result?: PaperCanaryCohortResult | null };
    return snapshot.result ? structuredClone(snapshot.result) : null;
  }
}

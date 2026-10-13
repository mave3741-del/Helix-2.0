import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DEFAULT_PAPER_CANARY_COHORT_POLICY,
  InMemoryPaperCanaryCohortStore,
  admitPaperCanaryCohort,
  comparePaperCanaryCohorts,
  evaluatePaperCanaryCohort,
} from './paper-canary-cohorts.ts';
import { PaperOperationSession } from '../ops/paper-operations.ts';

function runningSession(sessionId: string) {
  const session = new PaperOperationSession({ sessionId, readinessReady: true, ownerApprovalActive: true, liveExecutionEnabled: false });
  session.arm(1);
  session.start(2);
  return session.snapshot();
}

function definition(cohortId: string) {
  return {
    cohortId,
    label: `Cohort ${cohortId}`,
    sessionIds: [`session-${cohortId}`],
    strategyIds: [`strategy-${cohortId}`],
    windowStartMs: 100,
    windowEndMs: 1_000,
    policy: { minimumObservationCycles: 2, minimumTrades: 20, requiredRegimes: ['trend', 'range'] },
  };
}

function observations(cohortId: string, basePnl: number) {
  return [
    { observationId: `${cohortId}-1`, cohortId, sessionId: `session-${cohortId}`, cycleId: '1', observedAtMs: 200, regime: 'trend', tradeCount: 10, rejectedOrders: 0, reconciliationMismatches: 0, criticalAlerts: 0, p95LatencyMs: 100, netPnl: basePnl, maxDrawdown: 10, slippageBps: 3, healthStatus: 'healthy' as const, reconciliationHash: 'r1' },
    { observationId: `${cohortId}-2`, cohortId, sessionId: `session-${cohortId}`, cycleId: '2', observedAtMs: 300, regime: 'range', tradeCount: 10, rejectedOrders: 1, reconciliationMismatches: 0, criticalAlerts: 0, p95LatencyMs: 120, netPnl: basePnl, maxDrawdown: 12, slippageBps: 4, healthStatus: 'healthy' as const, reconciliationHash: 'r2' },
  ];
}

test('cohort admission is fail-closed for non-running or live sessions', () => {
  const def = definition('a');
  const planned = new PaperOperationSession({ sessionId: 'session-a', readinessReady: true, ownerApprovalActive: true, liveExecutionEnabled: false }).snapshot();
  const blocked = admitPaperCanaryCohort(def, [planned], true, false);
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.reasons.includes('cohort_session_not_running:session-a'));

  const live = { ...runningSession('session-a'), liveExecutionEnabled: false as const };
  const liveBlocked = admitPaperCanaryCohort(def, [live], false, true);
  assert.equal(liveBlocked.allowed, false);
  assert.ok(liveBlocked.reasons.includes('cohort_owner_capital_approval_required'));
  assert.ok(liveBlocked.reasons.includes('cohort_live_execution_forbidden'));
});

test('qualified cohort requires bounded window, regimes, trades, risk and reconciliation', () => {
  const def = definition('a');
  const result = evaluatePaperCanaryCohort(def, observations('a', 5));
  assert.equal(result.status, 'qualified');
  assert.equal(result.observationCount, 2);
  assert.equal(result.totalTrades, 20);
  assert.equal(result.reconciliationMismatches, 0);
  assert.equal(result.evidenceHash.length, 64);
});

test('cohort blocks observations outside its bounded window', () => {
  const def = definition('a');
  const result = evaluatePaperCanaryCohort(def, [...observations('a', 5), { ...observations('a', 5)[0], observationId: 'late', cycleId: 'late', observedAtMs: 2_000 }]);
  assert.equal(result.observationCount, 2);
});

test('cohort blocks observations from undeclared sessions and duplicate cycles', () => {
  const def = definition('a');
  const bad = [...observations('a', 5), { ...observations('a', 5)[0], observationId: 'foreign', cycleId: 'foreign', sessionId: 'not-declared' }];
  const result = evaluatePaperCanaryCohort(def, bad);
  assert.equal(result.status, 'blocked');
  assert.ok(result.reasons.includes('cohort_observation_session_not_declared:not-declared'));
});

test('cohort blocks reconciliation, latency and duplicate cycle defects', () => {
  const def = definition('a');
  const bad = observations('a', 5).map((item) => ({ ...item, reconciliationMismatches: 1, p95LatencyMs: 5_000 }));
  bad.push({ ...bad[0], observationId: 'dup', cycleId: '1' });
  const result = evaluatePaperCanaryCohort(def, bad);
  assert.equal(result.status, 'blocked');
  assert.ok(result.reasons.includes('cohort_reconciliation_mismatch'));
  assert.ok(result.reasons.includes('cohort_latency_exceeded'));
  assert.ok(result.reasons.includes('cohort_duplicate_cycle:session-a:1'));
});

test('comparison requires two qualified cohorts on the same bounded window', () => {
  const a = evaluatePaperCanaryCohort(definition('a'), observations('a', 8));
  const b = evaluatePaperCanaryCohort(definition('b'), observations('b', 4));
  const comparison = comparePaperCanaryCohorts([a, b]);
  assert.equal(comparison.status, 'comparable');
  assert.deepEqual(comparison.ranking, ['a', 'b']);
  assert.equal(comparison.metricDeltas.length, 1);
  assert.equal(comparison.evidenceHash.length, 64);
});

test('comparison is blocked when any cohort is not qualified', () => {
  const a = evaluatePaperCanaryCohort(definition('a'), observations('a', 8));
  const b = evaluatePaperCanaryCohort(definition('b'), [{ ...observations('b', 4)[0], reconciliationMismatches: 1 }, observations('b', 4)[1]]);
  const comparison = comparePaperCanaryCohorts([a, b]);
  assert.equal(comparison.status, 'blocked');
  assert.ok(comparison.reasons.includes('cohort_comparison_requires_all_cohorts_qualified'));
});

test('comparison ranking is deterministic and safety-first before net PnL', () => {
  const safe = evaluatePaperCanaryCohort({ ...definition('safe'), policy: { ...DEFAULT_PAPER_CANARY_COHORT_POLICY, minimumObservationCycles: 2, minimumTrades: 20, requiredRegimes: ['trend', 'range'] } }, observations('safe', 5));
  const profitableButRiskier = evaluatePaperCanaryCohort({ ...definition('riskier'), policy: { ...DEFAULT_PAPER_CANARY_COHORT_POLICY, minimumObservationCycles: 2, minimumTrades: 20, requiredRegimes: ['trend', 'range'] } }, observations('riskier', 20).map((item) => ({ ...item, rejectedOrders: 1, maxDrawdown: 30, slippageBps: 12 })));
  const comparison = comparePaperCanaryCohorts([profitableButRiskier, safe]);
  assert.equal(comparison.status, 'comparable');
  assert.deepEqual(comparison.ranking, ['safe', 'riskier']);
});

test('in-memory cohort store preserves observations and evaluated evidence', async () => {
  const store = new InMemoryPaperCanaryCohortStore();
  const def = definition('a');
  const admission = admitPaperCanaryCohort(def, [runningSession('session-a')], true, false);
  const result = evaluatePaperCanaryCohort(def, observations('a', 5));
  await store.saveCohort(admission, def, result);
  for (const observation of observations('a', 5)) await store.saveObservation(observation);
  const loadedObservations = await store.listObservations('a');
  const loadedResult = await store.loadCohortResult('a');
  assert.equal(admission.allowed, true);
  assert.equal(loadedObservations.length, 2);
  assert.equal(loadedResult?.evidenceHash, result.evidenceHash);
});


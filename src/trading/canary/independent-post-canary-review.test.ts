import assert from 'node:assert/strict';
import { test } from 'node:test';
import { performIndependentPostCanaryReview } from './independent-post-canary-review.ts';
import type { PaperCanaryCohortResult, PaperCanaryComparisonEvidence } from './paper-canary-cohorts.ts';

function cohort(id: string, status: 'qualified' | 'blocked' = 'qualified'): PaperCanaryCohortResult {
  return {
    status, cohortId: id, label: id, windowStartMs: 100, windowEndMs: 1000, observationCount: 20,
    totalTrades: 40, totalRejectedOrders: 0, rejectionRate: 0, reconciliationMismatches: 0,
    criticalAlerts: 0, maxP95LatencyMs: 100, netPnl: 10, worstDrawdown: 5, averageSlippageBps: 3,
    observedRegimes: ['range', 'trend'], reasons: [], evidenceHash: 'a'.repeat(64),
  };
}
function comparison(ids: string[], status: 'comparable' | 'blocked' = 'comparable'): PaperCanaryComparisonEvidence {
  return {
    comparisonId: 'canary-comparison:test', status, cohortIds: ids, ranking: ids,
    metricDeltas: [], reasons: [], evidenceHash: 'b'.repeat(64),
  };
}
function base() {
  return {
    reviewId: 'review-1', reviewerId: 'reviewer-1', implementerId: 'engineer-1', reviewTimeMs: 2000,
    cohortResults: [cohort('a'), cohort('b')], comparison: comparison(['a', 'b']),
    implementationHash: 'c'.repeat(64), testEvidenceHash: 'd'.repeat(64), openCriticalFindings: 0,
    conflictsDeclared: true, liveExecutionEnabled: false,
  } as const;
}

test('independent review approves only with separation, intact evidence and qualified cohorts', () => {
  const result = performIndependentPostCanaryReview(base());
  assert.equal(result.status, 'approved');
  assert.deepEqual(result.reviewedCohorts, ['a', 'b']);
  assert.deepEqual(result.qualifiedCohorts, ['a', 'b']);
  assert.equal(result.rearmPermitted, false);
  assert.equal(result.liveExecutionEnabled, false);
  assert.equal(result.evidenceHash.length, 64);
});

test('review blocks same reviewer and implementer', () => {
  const result = performIndependentPostCanaryReview({ ...base(), reviewerId: 'engineer-1' });
  assert.equal(result.status, 'blocked');
  assert.ok(result.reasons.includes('independent_review_separation_of_duties_missing'));
});

test('review blocks non-qualified cohort or non-comparable comparison', () => {
  const result = performIndependentPostCanaryReview({ ...base(), cohortResults: [cohort('a'), cohort('b', 'blocked')], comparison: comparison(['a', 'b'], 'blocked') });
  assert.equal(result.status, 'blocked');
  assert.ok(result.reasons.includes('cohort_not_qualified:b'));
  assert.ok(result.reasons.includes('cohort_comparison_not_comparable'));
});

test('review blocks tampered or mismatched evidence', () => {
  const result = performIndependentPostCanaryReview({ ...base(), testEvidenceHash: 'not-a-hash', comparison: comparison(['a']) });
  assert.equal(result.status, 'blocked');
  assert.ok(result.reasons.includes('test_evidence_hash_invalid'));
  assert.ok(result.reasons.includes('comparison_cohort_set_mismatch'));
});

test('review blocks unresolved critical findings, undeclared conflicts or live mode', () => {
  const result = performIndependentPostCanaryReview({ ...base(), openCriticalFindings: 1, conflictsDeclared: false, liveExecutionEnabled: true });
  assert.equal(result.status, 'blocked');
  assert.ok(result.reasons.includes('open_critical_findings_present'));
  assert.ok(result.reasons.includes('review_conflicts_not_declared'));
  assert.ok(result.reasons.includes('live_execution_forbidden'));
});

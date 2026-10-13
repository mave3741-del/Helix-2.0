import { createHash } from 'node:crypto';
import type { PaperCanaryCohortResult, PaperCanaryComparisonEvidence } from './paper-canary-cohorts.ts';

export interface IndependentPostCanaryReviewInput {
  reviewId: string;
  reviewerId: string;
  implementerId: string;
  reviewTimeMs: number;
  cohortResults: readonly PaperCanaryCohortResult[];
  comparison: PaperCanaryComparisonEvidence;
  implementationHash: string;
  testEvidenceHash: string;
  openCriticalFindings: number;
  conflictsDeclared: boolean;
  liveExecutionEnabled: boolean;
}

export interface IndependentPostCanaryReviewResult {
  status: 'approved' | 'blocked';
  reviewId: string;
  reviewerId: string;
  implementerId: string;
  reviewedCohorts: string[];
  qualifiedCohorts: string[];
  reasons: string[];
  evidenceHash: string;
  rearmPermitted: false;
  liveExecutionEnabled: false;
}

function sha256(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function requireHash(value: string, name: string, reasons: string[]): void {
  if (!/^[a-f0-9]{64}$/i.test(value)) reasons.push(`${name}_invalid`);
}

export function performIndependentPostCanaryReview(input: IndependentPostCanaryReviewInput): IndependentPostCanaryReviewResult {
  const reasons: string[] = [];
  if (!input.reviewId.trim()) reasons.push('review_id_required');
  if (!input.reviewerId.trim()) reasons.push('reviewer_id_required');
  if (!input.implementerId.trim()) reasons.push('implementer_id_required');
  if (input.reviewerId === input.implementerId) reasons.push('independent_review_separation_of_duties_missing');
  if (!Number.isInteger(input.reviewTimeMs) || input.reviewTimeMs <= 0) reasons.push('review_time_invalid');
  if (!input.conflictsDeclared) reasons.push('review_conflicts_not_declared');
  if (input.openCriticalFindings !== 0) reasons.push('open_critical_findings_present');
  if (input.liveExecutionEnabled) reasons.push('live_execution_forbidden');
  requireHash(input.implementationHash, 'implementation_hash', reasons);
  requireHash(input.testEvidenceHash, 'test_evidence_hash', reasons);
  if (input.cohortResults.length === 0) reasons.push('no_cohort_results');
  const ids = new Set<string>();
  for (const result of input.cohortResults) {
    if (ids.has(result.cohortId)) reasons.push(`duplicate_cohort_result:${result.cohortId}`);
    ids.add(result.cohortId);
    if (result.status !== 'qualified') reasons.push(`cohort_not_qualified:${result.cohortId}`);
    if (!/^[a-f0-9]{64}$/i.test(result.evidenceHash)) reasons.push(`cohort_evidence_hash_invalid:${result.cohortId}`);
  }
  if (input.comparison.status !== 'comparable') reasons.push('cohort_comparison_not_comparable');
  if (!/^[a-f0-9]{64}$/i.test(input.comparison.evidenceHash)) reasons.push('comparison_evidence_hash_invalid');
  const expectedIds = [...input.cohortResults.map((result) => result.cohortId)].sort();
  const comparisonIds = [...input.comparison.cohortIds].sort();
  if (JSON.stringify(expectedIds) !== JSON.stringify(comparisonIds)) reasons.push('comparison_cohort_set_mismatch');

  const reviewedCohorts = [...ids].sort();
  const qualifiedCohorts = input.cohortResults.filter((result) => result.status === 'qualified').map((result) => result.cohortId).sort();
  const payload = {
    reviewId: input.reviewId,
    reviewerId: input.reviewerId,
    implementerId: input.implementerId,
    reviewTimeMs: input.reviewTimeMs,
    implementationHash: input.implementationHash,
    testEvidenceHash: input.testEvidenceHash,
    cohortEvidence: input.cohortResults.map((result) => ({ cohortId: result.cohortId, status: result.status, evidenceHash: result.evidenceHash })),
    comparisonEvidenceHash: input.comparison.evidenceHash,
    reasons: [...new Set(reasons)].sort(),
  };
  return {
    status: reasons.length ? 'blocked' : 'approved',
    reviewId: input.reviewId,
    reviewerId: input.reviewerId,
    implementerId: input.implementerId,
    reviewedCohorts,
    qualifiedCohorts,
    reasons: [...new Set(reasons)].sort(),
    evidenceHash: sha256(payload),
    rearmPermitted: false,
    liveExecutionEnabled: false,
  };
}

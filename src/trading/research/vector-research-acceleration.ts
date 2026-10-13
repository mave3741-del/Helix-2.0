import { createHash } from 'node:crypto';
import { evaluateStatisticalEvidence, type ResearchStatisticalEvidence } from './statistics.ts';

export interface VectorParameterBound {
  name: string;
  values: number[];
}

export interface VectorResearchCandidate {
  candidateId: string;
  parameters: Record<string, number>;
  returns: number[];
}

export interface VectorResearchResult {
  candidateId: string;
  parameters: Record<string, number>;
  evidence: ResearchStatisticalEvidence;
  resultHash: string;
}

export interface VectorResearchRun {
  runId: string;
  strategyId: string;
  stage: 'in_sample' | 'out_of_sample' | 'walk_forward' | 'paper';
  candidateCount: number;
  evaluatedCount: number;
  maxCandidates: number;
  selectedCandidateId: string | null;
  inputHash: string;
  resultHash: string;
  liveExecutionEnabled: false;
  createdAt: number;
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${stableJson(object[key])}`).join(',')}}`;
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function validateBound(bound: VectorParameterBound): void {
  if (!bound.name.trim()) throw new Error('vector_parameter_name_required');
  if (!Array.isArray(bound.values) || bound.values.length === 0) throw new Error('vector_parameter_values_required');
  if (bound.values.some((value) => !Number.isFinite(value))) throw new Error('vector_parameter_values_must_be_finite');
}

export function enumerateBoundedParameterGrid(bounds: VectorParameterBound[], maxCandidates: number): Record<string, number>[] {
  if (!Number.isInteger(maxCandidates) || maxCandidates <= 0) throw new Error('vector_max_candidates_invalid');
  const normalized = [...bounds].map((bound) => ({ name: bound.name.trim(), values: [...bound.values].sort((a, b) => a - b) })).sort((a, b) => a.name.localeCompare(b.name));
  normalized.forEach(validateBound);
  const total = normalized.reduce((count, bound) => count * bound.values.length, 1);
  if (total > maxCandidates) throw new Error('vector_candidate_budget_exceeded');
  const output: Record<string, number>[] = [];
  function visit(index: number, current: Record<string, number>) {
    if (index === normalized.length) {
      output.push({ ...current });
      return;
    }
    const bound = normalized[index];
    for (const value of bound.values) {
      current[bound.name] = value;
      visit(index + 1, current);
    }
  }
  visit(0, {});
  return output;
}

export function vectorCandidateHash(parameters: Record<string, number>, returns: number[]): string {
  return sha256(stableJson({ parameters, returns }));
}

export function evaluateVectorResearch(input: {
  runId: string;
  strategyId: string;
  stage: VectorResearchRun['stage'];
  candidates: VectorResearchCandidate[];
  maxCandidates: number;
  robustnessByCandidate?: Record<string, number>;
  maxDrawdownByCandidate?: Record<string, number>;
}): { run: VectorResearchRun; results: VectorResearchResult[] } {
  if (!input.runId.trim()) throw new Error('vector_run_id_required');
  if (!input.strategyId.trim()) throw new Error('vector_strategy_id_required');
  if (input.candidates.length === 0) throw new Error('vector_candidates_required');
  if (!Number.isInteger(input.maxCandidates) || input.maxCandidates <= 0) throw new Error('vector_max_candidates_invalid');
  if (input.candidates.length > input.maxCandidates) throw new Error('vector_candidate_budget_exceeded');
  if (new Set(input.candidates.map((candidate) => candidate.candidateId)).size !== input.candidates.length) throw new Error('vector_candidate_duplicate');

  const results = input.candidates.map((candidate) => {
    if (candidate.returns.length === 0) throw new Error(`vector_returns_required:${candidate.candidateId}`);
    if (candidate.returns.some((value) => !Number.isFinite(value))) throw new Error(`vector_returns_invalid:${candidate.candidateId}`);
    const robustness = input.robustnessByCandidate?.[candidate.candidateId] ?? 0;
    const maxDrawdown = input.maxDrawdownByCandidate?.[candidate.candidateId] ?? 1;
    if (!Number.isFinite(maxDrawdown) || maxDrawdown < 0 || maxDrawdown > 1) throw new Error(`vector_drawdown_invalid:${candidate.candidateId}`);
    const evidence = evaluateStatisticalEvidence({ returns: candidate.returns, maxDrawdown, robustness, candidateCount: input.candidates.length });
    return {
      candidateId: candidate.candidateId,
      parameters: { ...candidate.parameters },
      evidence,
      resultHash: vectorCandidateHash(candidate.parameters, candidate.returns),
    };
  }).sort((a, b) => b.evidence.adjustedScore - a.evidence.adjustedScore || a.candidateId.localeCompare(b.candidateId));

  const selected = results.find((result) => result.evidence.maxDrawdown < 1 && result.evidence.tradeCount >= 30) ?? results[0];
  const inputHash = sha256(stableJson(input.candidates.map((candidate) => ({ candidateId: candidate.candidateId, parameters: candidate.parameters, returns: candidate.returns }))));
  const resultHash = sha256(stableJson(results));
  const run: VectorResearchRun = {
    runId: input.runId,
    strategyId: input.strategyId,
    stage: input.stage,
    candidateCount: input.candidates.length,
    evaluatedCount: results.length,
    maxCandidates: input.maxCandidates,
    selectedCandidateId: selected?.candidateId ?? null,
    inputHash,
    resultHash,
    liveExecutionEnabled: false,
    createdAt: Date.now(),
  };
  return { run, results };
}

export function canPromoteVectorResearch(result: VectorResearchResult): boolean {
  return result.evidence.tradeCount >= 50 && result.evidence.significantAt95 && result.evidence.robustness >= 0.7 && result.evidence.maxDrawdown < 0.25 && result.evidence.multipleTestingPenalty >= 0.5;
}

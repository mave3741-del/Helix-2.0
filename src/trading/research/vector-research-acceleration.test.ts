import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canPromoteVectorResearch,
  enumerateBoundedParameterGrid,
  evaluateVectorResearch,
  vectorCandidateHash,
} from './vector-research-acceleration.ts';

test('bounded parameter grid is deterministic and budgeted', () => {
  const grid = enumerateBoundedParameterGrid([
    { name: 'lookback', values: [20, 10] },
    { name: 'threshold', values: [2, 1] },
  ], 4);
  assert.deepEqual(grid, [
    { lookback: 10, threshold: 1 },
    { lookback: 10, threshold: 2 },
    { lookback: 20, threshold: 1 },
    { lookback: 20, threshold: 2 },
  ]);
  assert.throws(() => enumerateBoundedParameterGrid([{ name: 'x', values: [1, 2, 3] }], 2), /vector_candidate_budget_exceeded/);
});

test('vector research rejects duplicate candidate ids and invalid returns', () => {
  assert.throws(() => evaluateVectorResearch({
    runId: 'run-1', strategyId: 's', stage: 'in_sample', maxCandidates: 2,
    candidates: [
      { candidateId: 'x', parameters: { p: 1 }, returns: [0.01] },
      { candidateId: 'x', parameters: { p: 2 }, returns: [0.01] },
    ],
  }), /vector_candidate_duplicate/);
  assert.throws(() => evaluateVectorResearch({
    runId: 'run-2', strategyId: 's', stage: 'in_sample', maxCandidates: 1,
    candidates: [{ candidateId: 'x', parameters: { p: 1 }, returns: [Number.NaN] }],
  }), /vector_returns_invalid/);
});

test('vector run produces deterministic candidate and run hashes', () => {
  const a = evaluateVectorResearch({
    runId: 'run-3', strategyId: 's', stage: 'walk_forward', maxCandidates: 2,
    candidates: [
      { candidateId: 'b', parameters: { p: 2 }, returns: Array.from({ length: 30 }, () => 0.02) },
      { candidateId: 'a', parameters: { p: 1 }, returns: Array.from({ length: 30 }, () => 0.01) },
    ],
    robustnessByCandidate: { a: 0.8, b: 0.9 },
    maxDrawdownByCandidate: { a: 0.12, b: 0.10 },
  });
  const b = evaluateVectorResearch({ ...aInput() });
  assert.equal(a.run.inputHash, b.run.inputHash);
  assert.equal(a.run.resultHash, b.run.resultHash);
  const candidateB = a.results.find((result) => result.candidateId === 'b');
  assert(candidateB);
  assert.equal(candidateB.resultHash, vectorCandidateHash({ p: 2 }, Array.from({ length: 30 }, () => 0.02)));
});

test('multiple-testing penalty is applied to bounded search', () => {
  const { results } = evaluateVectorResearch({
    runId: 'run-4', strategyId: 's', stage: 'out_of_sample', maxCandidates: 2,
    candidates: [
      { candidateId: 'a', parameters: { p: 1 }, returns: Array.from({ length: 30 }, () => 0.01) },
      { candidateId: 'b', parameters: { p: 2 }, returns: Array.from({ length: 30 }, () => 0.011) },
    ],
    robustnessByCandidate: { a: 0.8, b: 0.8 },
    maxDrawdownByCandidate: { a: 0.12, b: 0.11 },
  });
  assert.equal(results[0].evidence.multipleTestingPenalty < 1, true);
});

test('promotion remains fail-closed unless statistical evidence is strong', () => {
  const weak = evaluateVectorResearch({
    runId: 'run-5', strategyId: 's', stage: 'paper', maxCandidates: 1,
    candidates: [{ candidateId: 'a', parameters: { p: 1 }, returns: Array.from({ length: 30 }, () => 0.001) }],
    robustnessByCandidate: { a: 0.2 },
    maxDrawdownByCandidate: { a: 0.50 },
  }).results[0];
  assert.equal(canPromoteVectorResearch(weak), false);
});


test('promotion can pass when the evidence gate is genuinely satisfied', () => {
  const strong = evaluateVectorResearch({
    runId: 'run-6', strategyId: 's', stage: 'paper', maxCandidates: 1,
    candidates: [{ candidateId: 'a', parameters: { p: 1 }, returns: Array.from({ length: 60 }, () => 0.01) }],
    robustnessByCandidate: { a: 0.9 },
    maxDrawdownByCandidate: { a: 0.10 },
  }).results[0];
  assert.equal(canPromoteVectorResearch(strong), true);
});

function aInput() {
  return {
    runId: 'run-3', strategyId: 's' as const, stage: 'walk_forward' as const, maxCandidates: 2,
    candidates: [
      { candidateId: 'b', parameters: { p: 2 }, returns: Array.from({ length: 30 }, () => 0.02) },
      { candidateId: 'a', parameters: { p: 1 }, returns: Array.from({ length: 30 }, () => 0.01) },
    ],
    robustnessByCandidate: { a: 0.8, b: 0.9 },
    maxDrawdownByCandidate: { a: 0.12, b: 0.10 },
  };
}

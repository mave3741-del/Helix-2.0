import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLearningAuditEntry, verifyLearningAuditChain } from './learning-audit-ledger.ts';

test('learning audit ledger forms a tamper-evident chain', () => {
  const first = buildLearningAuditEntry({ cycleId: 'c1', decisionHash: 'd1' } as any, null, 1000);
  const second = buildLearningAuditEntry({ cycleId: 'c2', decisionHash: 'd2' } as any, first.entryHash, 2000);
  assert.equal(verifyLearningAuditChain([first, second]), true);
  second.decisionHash = 'tampered';
  assert.equal(verifyLearningAuditChain([first, second]), false);
});

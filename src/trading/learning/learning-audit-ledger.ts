import { createHash } from 'node:crypto';
import type { Phase5LearningResult } from './phase5-learning-orchestrator.ts';

export interface LearningAuditEntry {
  cycleId: string;
  decisionHash: string;
  previousHash: string | null;
  entryHash: string;
  createdAt: number;
}

export function buildLearningAuditEntry(result: Phase5LearningResult, previousHash: string | null, createdAt = Date.now()): LearningAuditEntry {
  const payload = { cycleId: result.cycleId, decisionHash: result.decisionHash, previousHash, createdAt };
  const entryHash = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  return { cycleId: result.cycleId, decisionHash: result.decisionHash, previousHash, entryHash, createdAt };
}

export function verifyLearningAuditChain(entries: LearningAuditEntry[]): boolean {
  let previous: string | null = null;
  for (const entry of entries) {
    if (entry.previousHash !== previous) return false;
    const expected: string = buildLearningAuditEntry({ cycleId: entry.cycleId, decisionHash: entry.decisionHash } as Phase5LearningResult, entry.previousHash, entry.createdAt).entryHash;
    if (expected !== entry.entryHash) return false;
    previous = entry.entryHash;
  }
  return true;
}

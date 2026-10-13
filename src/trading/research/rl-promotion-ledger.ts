import { createHash } from 'node:crypto';

export type RlPromotionDecision = 'promoted' | 'rejected';

export interface RlPromotionEvidence {
  oosHash: string;
  robustnessHash: string;
  stressHashes: string[];
  evaluationHash?: string;
}

export interface RlPromotionCandidate {
  candidateId: string;
  experimentId: string;
  environmentHash: string;
  algorithm: string;
  seeds: number[];
  configHash: string;
  evidence: RlPromotionEvidence;
  gateEligible: boolean;
  rejectionReasons?: string[];
  createdAt: number;
}

export interface RlPromotionLedgerEntry extends RlPromotionCandidate {
  previousHash: string | null;
  decision: RlPromotionDecision;
  entryHash: string;
}

const stable = (v: unknown): string => v === null || typeof v !== 'object'
  ? JSON.stringify(v)
  : Array.isArray(v)
    ? `[${v.map(stable).join(',')}]`
    : `{${Object.keys(v as Record<string, unknown>).sort().map(k => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`).join(',')}}`;
const sha256 = (v: unknown) => createHash('sha256').update(stable(v), 'utf8').digest('hex');

function validateCandidate(c: RlPromotionCandidate): void {
  if (!c.candidateId.trim() || !c.experimentId.trim() || !c.environmentHash.trim() || !c.algorithm.trim() || !c.configHash.trim()) throw new Error('rl_promotion_identity_required');
  if (!Number.isFinite(c.createdAt)) throw new Error('rl_promotion_created_at_invalid');
  const seeds = [...new Set(c.seeds)].sort((a, b) => a - b);
  if (seeds.length < 2 || seeds.some(s => !Number.isInteger(s))) throw new Error('rl_promotion_requires_two_distinct_integer_seeds');
  const evidence = [c.evidence.oosHash, c.evidence.robustnessHash, ...c.evidence.stressHashes, ...(c.evidence.evaluationHash ? [c.evidence.evaluationHash] : [])];
  if (!evidence.length || evidence.some(h => !/^[a-f0-9]{64}$/i.test(h))) throw new Error('rl_promotion_evidence_hash_invalid');
  if (c.gateEligible && (c.rejectionReasons?.length ?? 0) > 0) throw new Error('rl_promotion_eligible_with_rejection_reasons');
}

export function buildRlPromotionEntry(candidate: RlPromotionCandidate, previousHash: string | null): RlPromotionLedgerEntry {
  validateCandidate(candidate);
  const decision: RlPromotionDecision = candidate.gateEligible ? 'promoted' : 'rejected';
  if (!candidate.gateEligible && !(candidate.rejectionReasons?.length)) throw new Error('rl_promotion_rejection_reasons_required');
  const payload = { candidateId: candidate.candidateId, experimentId: candidate.experimentId, environmentHash: candidate.environmentHash, algorithm: candidate.algorithm, seeds: [...new Set(candidate.seeds)].sort((a, b) => a - b), configHash: candidate.configHash, evidence: candidate.evidence, gateEligible: candidate.gateEligible, rejectionReasons: candidate.rejectionReasons ?? [], createdAt: candidate.createdAt, decision, previousHash };
  return { ...candidate, seeds: payload.seeds, decision, previousHash, entryHash: sha256(payload) };
}

export function verifyRlPromotionLedger(entries: RlPromotionLedgerEntry[]): boolean {
  let previous: string | null = null;
  const candidateIds = new Set<string>();
  for (const entry of entries) {
    try { validateCandidate(entry); } catch { return false; }
    if (candidateIds.has(entry.candidateId) || entry.previousHash !== previous) return false;
    const expected = buildRlPromotionEntry(entry, entry.previousHash);
    if (expected.entryHash !== entry.entryHash || expected.decision !== entry.decision) return false;
    candidateIds.add(entry.candidateId);
    previous = entry.entryHash;
  }
  return true;
}

export class InMemoryRlPromotionLedger {
  private readonly entries: RlPromotionLedgerEntry[] = [];
  append(candidate: RlPromotionCandidate): RlPromotionLedgerEntry {
    const entry = buildRlPromotionEntry(candidate, this.entries.at(-1)?.entryHash ?? null);
    if (this.entries.some(e => e.candidateId === entry.candidateId)) throw new Error('rl_promotion_duplicate_candidate');
    this.entries.push(entry);
    return entry;
  }
  list(): RlPromotionLedgerEntry[] { return this.entries.map(e => ({ ...e, seeds: [...e.seeds], evidence: { ...e.evidence, stressHashes: [...e.evidence.stressHashes] } })); }
}

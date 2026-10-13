import { createHash } from 'node:crypto';
import type { RlPromotionLedgerEntry } from './rl-promotion-ledger.ts';

export type RlLineageRole = 'champion' | 'challenger';
export type RlLineageDecision = 'promoted' | 'rejected' | 'rolled_back';

export interface RlLineageEvent {
  lineageId: string;
  candidateId: string;
  role: RlLineageRole;
  decision: RlLineageDecision;
  previousChampionId: string | null;
  previousChallengerId: string | null;
  replacementCandidateId: string | null;
  sourceLedgerEntryHash: string;
  reason: string;
  createdAt: number;
  previousEventHash: string | null;
  eventHash: string;
}

const stable = (v: unknown): string => v === null || typeof v !== 'object' ? JSON.stringify(v) : Array.isArray(v) ? `[${v.map(stable).join(',')}]` : `{${Object.keys(v as Record<string, unknown>).sort().map(k => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`).join(',')}}`;
const sha256 = (v: unknown) => createHash('sha256').update(stable(v), 'utf8').digest('hex');
const hashRe = /^[a-f0-9]{64}$/i;

function validateLedgerEntry(entry: RlPromotionLedgerEntry): void {
  if (!hashRe.test(entry.entryHash)) throw new Error('rl_lineage_source_ledger_hash_invalid');
}

function validateEventInput(event: Omit<RlLineageEvent, 'eventHash'>): void {
  if (!event.lineageId.trim() || !event.candidateId.trim() || !event.reason.trim()) throw new Error('rl_lineage_identity_required');
  if (!hashRe.test(event.sourceLedgerEntryHash)) throw new Error('rl_lineage_source_ledger_hash_invalid');
  if (event.previousEventHash !== null && !hashRe.test(event.previousEventHash)) throw new Error('rl_lineage_previous_hash_invalid');
  if (!Number.isFinite(event.createdAt)) throw new Error('rl_lineage_created_at_invalid');
  if (event.decision === 'promoted' && event.role !== 'champion') throw new Error('rl_lineage_promotion_requires_champion');
  if (event.decision === 'rolled_back' && !event.replacementCandidateId) throw new Error('rl_lineage_rollback_replacement_required');
}

export function buildRlLineageEvent(input: Omit<RlLineageEvent, 'eventHash'>): RlLineageEvent {
  validateEventInput(input);
  return { ...input, eventHash: sha256(input) };
}

export function buildPromotionLineageEvent(entry: RlPromotionLedgerEntry, state: { championId: string | null; challengerId: string | null; reason?: string }, now: number): RlLineageEvent {
  validateLedgerEntry(entry);
  if (entry.decision !== 'promoted') throw new Error('rl_lineage_only_promoted_ledger_entry_can_promote');
  if (state.championId === entry.candidateId) throw new Error('rl_lineage_candidate_already_champion');
  return buildRlLineageEvent({ lineageId: `${entry.experimentId}:${entry.candidateId}:${now}`, candidateId: entry.candidateId, role: 'champion', decision: 'promoted', previousChampionId: state.championId, previousChallengerId: state.challengerId, replacementCandidateId: entry.candidateId, sourceLedgerEntryHash: entry.entryHash, reason: state.reason?.trim() || 'candidate_promoted_by_rl_gate', createdAt: now, previousEventHash: null });
}

export function buildRollbackLineageEvent(entry: RlPromotionLedgerEntry, state: { championId: string | null; challengerId: string | null; replacementCandidateId: string }, reason: string, now: number): RlLineageEvent {
  validateLedgerEntry(entry);
  if (entry.candidateId !== state.championId) throw new Error('rl_lineage_rollback_requires_current_champion');
  return buildRlLineageEvent({ lineageId: `${entry.experimentId}:${entry.candidateId}:rollback:${now}`, candidateId: entry.candidateId, role: 'champion', decision: 'rolled_back', previousChampionId: state.championId, previousChallengerId: state.challengerId, replacementCandidateId: state.replacementCandidateId, sourceLedgerEntryHash: entry.entryHash, reason, createdAt: now, previousEventHash: null });
}

export function verifyRlPromotionLineage(events: RlLineageEvent[]): boolean {
  let previous: string | null = null;
  const seen = new Set<string>();
  let champion: string | null = null;
  for (const event of events) {
    try { validateEventInput(event); } catch { return false; }
    if (seen.has(event.lineageId) || event.previousEventHash !== previous) return false;
    if (event.decision === 'promoted') {
      if (event.previousChampionId !== champion || event.candidateId === champion) return false;
      champion = event.candidateId;
    } else if (event.decision === 'rolled_back') {
      if (event.previousChampionId !== champion || event.replacementCandidateId === champion) return false;
      champion = event.replacementCandidateId;
    }
    const { eventHash: _eventHash, ...payload } = event;
    const expected = buildRlLineageEvent(payload);
    if (expected.eventHash !== event.eventHash) return false;
    seen.add(event.lineageId);
    previous = event.eventHash;
  }
  return true;
}

export class InMemoryRlPromotionLineage {
  private readonly events: RlLineageEvent[] = [];
  private championId: string | null = null;
  private challengerId: string | null = null;

  promote(entry: RlPromotionLedgerEntry, reason?: string, now = Date.now()): RlLineageEvent {
    const event = buildPromotionLineageEvent(entry, { championId: this.championId, challengerId: this.challengerId, reason }, now);
    event.previousEventHash = this.events.at(-1)?.eventHash ?? null;
    const { eventHash: _eventHash, ...payload } = event;
    event.eventHash = sha256(payload);
    this.events.push(event);
    this.championId = entry.candidateId;
    this.challengerId = null;
    return { ...event };
  }

  setChallenger(candidateId: string, sourceLedgerEntryHash: string, now = Date.now()): RlLineageEvent {
    if (!candidateId.trim() || this.championId === candidateId) throw new Error('rl_lineage_invalid_challenger');
    const event = buildRlLineageEvent({ lineageId: `challenger:${candidateId}:${now}`, candidateId, role: 'challenger', decision: 'rejected', previousChampionId: this.championId, previousChallengerId: this.challengerId, replacementCandidateId: null, sourceLedgerEntryHash, reason: 'challenger_registered', createdAt: now, previousEventHash: this.events.at(-1)?.eventHash ?? null });
    this.events.push(event);
    this.challengerId = candidateId;
    return { ...event };
  }

  rollback(entry: RlPromotionLedgerEntry, replacementCandidateId: string, reason: string, now = Date.now()): RlLineageEvent {
    const event = buildRollbackLineageEvent(entry, { championId: this.championId, challengerId: this.challengerId, replacementCandidateId }, reason, now);
    event.previousEventHash = this.events.at(-1)?.eventHash ?? null;
    const { eventHash: _eventHash, ...payload } = event;
    event.eventHash = sha256(payload);
    this.events.push(event);
    this.championId = replacementCandidateId;
    this.challengerId = null;
    return { ...event };
  }

  state() { return { championId: this.championId, challengerId: this.challengerId }; }
  list() { return this.events.map(e => ({ ...e })); }
}

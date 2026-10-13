import { createHash } from 'node:crypto';

export type RlEvaluationRole = 'champion' | 'challenger';

export interface RlEvaluationScheduleInput {
  subjectId: string;
  role: RlEvaluationRole;
  lastEvaluationAt: number | null;
  now: number;
  cadenceMs: number;
  freshnessMs: number;
  graceMs?: number;
  enabled?: boolean;
  evidenceHash?: string | null;
}

export interface RlEvaluationScheduleResult {
  subjectId: string;
  role: RlEvaluationRole;
  due: boolean;
  eligible: boolean;
  missed: boolean;
  evidenceFresh: boolean;
  ageMs: number | null;
  nextDueAt: number | null;
  reasons: string[];
  deterministicHash: string;
}

const hashRe = /^[a-f0-9]{64}$/i;
const stable = (v: unknown): string =>
  v === null || typeof v !== 'object' ? JSON.stringify(v) :
  Array.isArray(v) ? `[${v.map(stable).join(',')}]` :
  `{${Object.keys(v as Record<string, unknown>).sort().map(k => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`).join(',')}}`;
const sha256 = (v: unknown) => createHash('sha256').update(stable(v), 'utf8').digest('hex');

export function evaluateRlEvaluationSchedule(input: RlEvaluationScheduleInput): RlEvaluationScheduleResult {
  if (!input.subjectId.trim()) throw new Error('rl_schedule_subject_required');
  if (!Number.isFinite(input.now)) throw new Error('rl_schedule_time_invalid');
  if (!Number.isFinite(input.cadenceMs) || input.cadenceMs <= 0) throw new Error('rl_schedule_cadence_invalid');
  if (!Number.isFinite(input.freshnessMs) || input.freshnessMs < 0) throw new Error('rl_schedule_freshness_invalid');
  const graceMs = input.graceMs ?? 0;
  if (!Number.isFinite(graceMs) || graceMs < 0) throw new Error('rl_schedule_grace_invalid');
  if (input.evidenceHash != null && !hashRe.test(input.evidenceHash)) throw new Error('rl_schedule_evidence_hash_invalid');

  const enabled = input.enabled !== false;
  const hasLast = input.lastEvaluationAt != null;
  if (hasLast && !Number.isFinite(input.lastEvaluationAt as number)) throw new Error('rl_schedule_last_evaluation_invalid');
  const last = input.lastEvaluationAt;
  const ageMs = last == null ? null : Math.max(0, input.now - last);
  const nextDueAt = last == null ? input.now : last + input.cadenceMs;
  const due = enabled && (last == null || input.now >= nextDueAt);
  const missed = enabled && last != null && input.now > nextDueAt + graceMs;
  const evidenceFresh = ageMs != null && ageMs <= input.freshnessMs && !!input.evidenceHash;
  const reasons: string[] = [];
  if (!enabled) reasons.push('schedule_disabled');
  if (last == null) reasons.push('initial_evaluation_required');
  if (missed) reasons.push('evaluation_window_missed');
  if (!evidenceFresh) reasons.push('evidence_stale_or_missing');

  // A missed window or stale evidence fails closed; a future-due evaluation is not a failure.
  const eligible = enabled && !missed && !due && evidenceFresh;
  if (due) reasons.push('evaluation_due');
  const payload = {
    subjectId: input.subjectId, role: input.role, lastEvaluationAt: last, now: input.now,
    cadenceMs: input.cadenceMs, freshnessMs: input.freshnessMs, graceMs, enabled,
    evidenceHash: input.evidenceHash ?? null, due, eligible, missed, evidenceFresh, ageMs, nextDueAt, reasons
  };
  return { subjectId: input.subjectId, role: input.role, due, eligible, missed, evidenceFresh, ageMs, nextDueAt, reasons, deterministicHash: sha256(payload) };
}

export function evaluateRlChampionChallengerSchedule(
  champion: RlEvaluationScheduleInput,
  challenger: RlEvaluationScheduleInput,
): { champion: RlEvaluationScheduleResult; challenger: RlEvaluationScheduleResult; eligible: boolean; reasons: string[]; deterministicHash: string } {
  if (champion.role !== 'champion' || challenger.role !== 'challenger') throw new Error('rl_schedule_role_mismatch');
  const c = evaluateRlEvaluationSchedule(champion);
  const h = evaluateRlEvaluationSchedule(challenger);
  const reasons = [...c.reasons.filter(r => r !== 'evaluation_due'), ...h.reasons.filter(r => r !== 'evaluation_due')];
  if (c.missed) reasons.push('champion_evaluation_missed');
  if (h.missed) reasons.push('challenger_evaluation_missed');
  if (!c.evidenceFresh) reasons.push('champion_evidence_not_fresh');
  if (!h.evidenceFresh) reasons.push('challenger_evidence_not_fresh');
  const eligible = c.eligible && h.eligible;
  return { champion: c, challenger: h, eligible, reasons: [...new Set(reasons)], deterministicHash: sha256({ championHash: c.deterministicHash, challengerHash: h.deterministicHash, eligible, reasons: [...new Set(reasons)] }) };
}

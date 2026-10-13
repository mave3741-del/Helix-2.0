import { createHash } from 'node:crypto';
import { evaluateRlChampionChallengerSchedule, type RlEvaluationScheduleInput, type RlEvaluationScheduleResult } from './rl-evaluation-scheduler.ts';
import { reassessRlChampion, type RlReassessmentInput, type RlReassessmentResult } from './rl-continuous-reassessment.ts';
import type { RlPromotionLedgerEntry } from './rl-promotion-ledger.ts';

export type RlLifecycleDecision = 'promote' | 'retain' | 'rollback' | 'hold';
export interface RlLifecycleInput {
  championSchedule: RlEvaluationScheduleInput;
  challengerSchedule: RlEvaluationScheduleInput;
  reassessment: RlReassessmentInput;
  challengerCandidateId: string | null;
  challengerLedgerEntry: RlPromotionLedgerEntry | null;
  promotionLedgerEntry: RlPromotionLedgerEntry | null;
  previousChampionId: string | null;
}
export interface RlLifecycleResult {
  decision: RlLifecycleDecision;
  championSchedule: RlEvaluationScheduleResult;
  challengerSchedule: RlEvaluationScheduleResult;
  reassessment: RlReassessmentResult;
  reasons: string[];
  candidateId: string | null;
  previousChampionId: string | null;
  deterministicHash: string;
}
const stable=(v:unknown):string=>v===null||typeof v!=='object'?JSON.stringify(v):Array.isArray(v)?`[${v.map(stable).join(',')}]`:`{${Object.keys(v as Record<string,unknown>).sort().map(k=>`${JSON.stringify(k)}:${stable((v as Record<string,unknown>)[k])}`).join(',')}}`;
const sha=(v:unknown)=>createHash('sha256').update(stable(v),'utf8').digest('hex');
const hashRe=/^[a-f0-9]{64}$/i;

function validLedger(entry: RlPromotionLedgerEntry|null, label:string): void {
  if (!entry) return;
  if (!hashRe.test(entry.entryHash)) throw new Error(`${label}_ledger_hash_invalid`);
}

export function evaluateRlLifecycle(input:RlLifecycleInput):RlLifecycleResult {
  if (!input.previousChampionId?.trim() || input.previousChampionId !== input.reassessment.championId) throw new Error('rl_lifecycle_champion_identity_mismatch');
  if (input.challengerCandidateId !== input.challengerSchedule.subjectId && input.challengerCandidateId !== null) throw new Error('rl_lifecycle_challenger_identity_mismatch');
  validLedger(input.promotionLedgerEntry,'rl_lifecycle_promotion');
  validLedger(input.challengerLedgerEntry,'rl_lifecycle_challenger');
  if (input.promotionLedgerEntry && input.promotionLedgerEntry.candidateId !== input.challengerCandidateId) throw new Error('rl_lifecycle_promotion_candidate_mismatch');
  const schedules=evaluateRlChampionChallengerSchedule(input.championSchedule,input.challengerSchedule);
  const reassessment=reassessRlChampion(input.reassessment);
  const reasons:string[]=[];
  let decision:RlLifecycleDecision='hold';
  let candidateId:string|null=null;

  if (reassessment.decision==='rollback') {
    decision='rollback';
    reasons.push('champion_reassessment_failed');
  } else if (schedules.champion.missed || !schedules.champion.evidenceFresh) {
    decision='rollback';
    reasons.push('champion_schedule_not_healthy');
  } else if (input.challengerCandidateId && input.promotionLedgerEntry && input.promotionLedgerEntry.decision==='promoted' && schedules.challenger.evidenceFresh && !schedules.challenger.missed) {
    decision='promote';
    candidateId=input.challengerCandidateId;
    reasons.push('challenger_promotion_eligible');
  } else if (schedules.challenger.missed || !schedules.challenger.evidenceFresh) {
    decision='hold';
    reasons.push('challenger_evidence_not_ready');
  } else {
    decision='retain';
    reasons.push('champion_retained');
  }
  const allReasons=[...new Set([...schedules.reasons,...reassessment.reasons,...reasons])];
  const payload={decision,championScheduleHash:schedules.champion.deterministicHash,challengerScheduleHash:schedules.challenger.deterministicHash,reassessmentHash:reassessment.deterministicHash,reasons:allReasons,candidateId,previousChampionId:input.previousChampionId,promotionLedgerHash:input.promotionLedgerEntry?.entryHash??null,challengerLedgerHash:input.challengerLedgerEntry?.entryHash??null};
  return {decision,championSchedule:schedules.champion,challengerSchedule:schedules.challenger,reassessment,reasons:allReasons,candidateId,previousChampionId:input.previousChampionId,deterministicHash:sha(payload)};
}

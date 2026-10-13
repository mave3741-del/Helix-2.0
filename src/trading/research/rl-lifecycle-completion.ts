import { createHash } from 'node:crypto';
import { recoverLatest, type RlLifecycleSnapshot } from './rl-lifecycle-recovery.ts';
import { evaluateRlDrift, type RlDriftInput, type RlDriftResult } from './rl-lifecycle-drift.ts';

export type RlGovernanceDecision = 'promote' | 'retain' | 'rollback' | 'hold' | 'stop';
export interface RlCompletionInput {
  snapshots: RlLifecycleSnapshot[];
  drift: RlDriftInput;
  candidateId: string | null;
  evidenceFresh: boolean;
  evidenceComplete: boolean;
  emergencyStop: boolean;
  approvalRequired: boolean;
  approvalGranted: boolean;
}
export interface RlCompletionResult {
  decision: RlGovernanceDecision;
  recoveredSequence: number | null;
  drift: RlDriftResult;
  reasons: string[];
  deterministicHash: string;
}
const stable=(v:unknown):string=>v===null||typeof v!=='object'?JSON.stringify(v):Array.isArray(v)?`[${v.map(stable).join(',')}]`:`{${Object.keys(v as Record<string,unknown>).sort().map(k=>JSON.stringify(k)+':'+stable((v as Record<string,unknown>)[k])).join(',')}}`;
const sha=(v:unknown)=>createHash('sha256').update(stable(v),'utf8').digest('hex');

export function evaluateRlCompletion(input:RlCompletionInput):RlCompletionResult {
  if (input.emergencyStop) return result('stop', null, {decision:'healthy',degradationRate:0,deterministicHash:sha('stop')}, ['emergency_stop_active']);
  const latest=recoverLatest(input.snapshots);
  const drift=evaluateRlDrift(input.drift);
  const reasons:string[]=[];
  let decision:RlGovernanceDecision='hold';
  if (!input.evidenceComplete || !input.evidenceFresh) { decision='hold'; reasons.push('evidence_not_ready'); }
  else if (drift.decision==='rollback') { decision='rollback'; reasons.push('champion_drift_exceeded'); }
  else if (input.candidateId && (!input.approvalRequired || input.approvalGranted)) { decision='promote'; reasons.push('candidate_governance_eligible'); }
  else { decision='retain'; reasons.push('champion_retained'); }
  return result(decision, latest?.sequence ?? null, drift, reasons);
}
function result(decision:RlGovernanceDecision, recoveredSequence:number|null, drift:RlDriftResult, reasons:string[]):RlCompletionResult {
  const payload={decision,recoveredSequence,driftHash:drift.deterministicHash,reasons:[...new Set(reasons)]};
  return {decision,recoveredSequence,drift,reasons:payload.reasons,deterministicHash:sha(payload)};
}

import { createHash } from 'node:crypto';
export type RlLifecycleState = 'promote'|'retain'|'rollback'|'hold';
export interface RlLifecycleSnapshot { sequence:number; state:RlLifecycleState; championId:string|null; challengerId:string|null; lifecycleHash:string; previousHash:string|null; createdAt:number; }
const stable=(v:unknown):string=>v===null||typeof v!=='object'?JSON.stringify(v):Array.isArray(v)?`[${v.map(stable).join(',')}]`:`{${Object.keys(v as Record<string,unknown>).sort().map(k=>JSON.stringify(k)+':'+stable((v as Record<string,unknown>)[k])).join(',')}}`;
const sha=(v:unknown)=>createHash('sha256').update(stable(v)).digest('hex');
const hex=/^[a-f0-9]{64}$/i;
export function buildSnapshot(input:Omit<RlLifecycleSnapshot,'lifecycleHash'>):RlLifecycleSnapshot { if(input.sequence<1) throw new Error('rl_recovery_sequence_invalid'); if(input.previousHash!==null&&!hex.test(input.previousHash)) throw new Error('rl_recovery_previous_hash_invalid'); return {...input,lifecycleHash:sha(input)}; }
export function verifySnapshots(snapshots:RlLifecycleSnapshot[]):void { let prev:string|null=null, seq=0; for(const s of snapshots){ if(s.sequence!==++seq) throw new Error('rl_recovery_sequence_gap'); if(s.previousHash!==prev) throw new Error('rl_recovery_chain_break'); const {lifecycleHash:_, ...content}=s; const expected=sha(content); if(s.lifecycleHash!==expected) throw new Error('rl_recovery_hash_mismatch'); prev=s.lifecycleHash; } }
export function recoverLatest(snapshots:RlLifecycleSnapshot[]):RlLifecycleSnapshot|null { if(!snapshots.length) return null; verifySnapshots(snapshots); return snapshots[snapshots.length-1]; }

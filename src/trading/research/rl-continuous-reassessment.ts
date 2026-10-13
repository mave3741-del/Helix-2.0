import { createHash } from 'node:crypto';
import type { RlRobustnessResult } from './rl-robustness-gate.ts';

export type RlReassessmentDecision = 'retain' | 'rollback';
export interface RlReassessmentInput {
  championId: string;
  baselineEvidenceHash: string;
  current: RlRobustnessResult;
  maxDegradationRate: number;
  minStressPassRate: number;
  minSeedRobustnessRate: number;
  maxDrawdown?: number;
  now: number;
}
export interface RlReassessmentResult {
  championId: string;
  decision: RlReassessmentDecision;
  reasons: string[];
  metrics: { stressPassRate: number; seedRobustnessRate: number; worstDrawdown: number | null };
  baselineEvidenceHash: string;
  deterministicHash: string;
}
const stable=(v:unknown):string=>v===null||typeof v!=='object'?JSON.stringify(v):Array.isArray(v)?`[${v.map(stable).join(',')}]`:`{${Object.keys(v as Record<string,unknown>).sort().map(k=>`${JSON.stringify(k)}:${stable((v as Record<string,unknown>)[k])}`).join(',')}}`;
const sha=(v:unknown)=>createHash('sha256').update(stable(v),'utf8').digest('hex');
const hashRe=/^[a-f0-9]{64}$/i;
export function reassessRlChampion(input:RlReassessmentInput):RlReassessmentResult{
 if(!input.championId.trim()) throw new Error('rl_reassessment_champion_required');
 if(!hashRe.test(input.baselineEvidenceHash)) throw new Error('rl_reassessment_baseline_hash_invalid');
 if(!Number.isFinite(input.maxDegradationRate)||input.maxDegradationRate<0||input.maxDegradationRate>1) throw new Error('rl_reassessment_degradation_gate_invalid');
 if(!Number.isFinite(input.minStressPassRate)||input.minStressPassRate<0||input.minStressPassRate>1) throw new Error('rl_reassessment_stress_gate_invalid');
 if(!Number.isFinite(input.minSeedRobustnessRate)||input.minSeedRobustnessRate<0||input.minSeedRobustnessRate>1) throw new Error('rl_reassessment_seed_gate_invalid');
 if(!Number.isFinite(input.now)) throw new Error('rl_reassessment_time_invalid');
 const m=input.current.aggregate;
 const worstDrawdown=input.current.oos.aggregate.worstDrawdown;
 const reasons:string[]=[];
 if(!input.current.gate.eligible) reasons.push('robustness_gate_failed');
 if(m.combinedStressPassRate<input.minStressPassRate) reasons.push('stress_pass_rate_below_gate');
 if(m.seedRobustnessRate<input.minSeedRobustnessRate) reasons.push('seed_robustness_rate_below_gate');
 if(input.maxDrawdown!==undefined && (!Number.isFinite(worstDrawdown??NaN)|| (worstDrawdown as number)>input.maxDrawdown)) reasons.push('drawdown_above_gate');
 const result:RlReassessmentResult={championId:input.championId,decision:reasons.length?'rollback':'retain',reasons,metrics:{stressPassRate:m.combinedStressPassRate,seedRobustnessRate:m.seedRobustnessRate,worstDrawdown},baselineEvidenceHash:input.baselineEvidenceHash,deterministicHash:''};
 result.deterministicHash=sha({...result,deterministicHash:undefined,now:input.now});
 return result;
}

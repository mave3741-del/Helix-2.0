import { stableHash } from "./task-results.ts";

export interface WorkerReasoningTraceRecord {
  reasonId: string;
  taskId: string;
  workerId: string;
  taskType: string;
  provider: string;
  modelId: string;
  policyVersion: string;
  inputHash: string;
  outputHash: string;
  trace: Record<string, unknown>;
  createdAt: number;
}

export interface WorkerReasoningTraceStore {
  record(record: WorkerReasoningTraceRecord): Promise<{ inserted: boolean; record: WorkerReasoningTraceRecord }>;
  listByTask(taskId: string): Promise<WorkerReasoningTraceRecord[]>;
}

function clone<T>(v:T):T { return structuredClone(v); }

export class InMemoryWorkerReasoningTraceStore implements WorkerReasoningTraceStore {
  private readonly records = new Map<string, WorkerReasoningTraceRecord>();
  async record(record: WorkerReasoningTraceRecord) { const existing=this.records.get(record.reasonId); if(existing) return {inserted:false,record:clone(existing)}; this.records.set(record.reasonId,clone(record)); return {inserted:true,record:clone(record)}; }
  async listByTask(taskId:string) { return [...this.records.values()].filter((x)=>x.taskId===taskId).sort((a,b)=>a.createdAt-b.createdAt||a.reasonId.localeCompare(b.reasonId)).map(clone); }
}

interface SqlLike { query<T=Record<string,unknown>>(text:string,params?:unknown[]):Promise<T[]>; }
function parse(v:unknown):unknown { return typeof v === "string" ? JSON.parse(v) : v; }
function ms(v:unknown):number { return v == null ? 0 : new Date(String(v)).getTime(); }

export class SqlWorkerReasoningTraceStore implements WorkerReasoningTraceStore {
  private sqlPromise:Promise<SqlLike>|null=null;
  private sql():Promise<SqlLike> { this.sqlPromise ??= import("../../lib/db.ts").then(({getSql})=>getSql()); return this.sqlPromise; }
  async record(record:WorkerReasoningTraceRecord) {
    const sql=await this.sql();
    const rows=await sql.query<Record<string,unknown>>(`insert into trading_worker_reasoning (reason_id,task_id,worker_id,task_type,provider,model_id,policy_version,input_hash,output_hash,trace,created_at) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,to_timestamp($11/1000.0)) on conflict (reason_id) do nothing returning *`,[record.reasonId,record.taskId,record.workerId,record.taskType,record.provider,record.modelId,record.policyVersion,record.inputHash,record.outputHash,JSON.stringify(record.trace),record.createdAt]);
    const from=(r:Record<string,unknown>):WorkerReasoningTraceRecord=>({reasonId:String(r.reason_id),taskId:String(r.task_id),workerId:String(r.worker_id),taskType:String(r.task_type),provider:String(r.provider),modelId:String(r.model_id),policyVersion:String(r.policy_version),inputHash:String(r.input_hash),outputHash:String(r.output_hash),trace:(parse(r.trace)??{}) as Record<string,unknown>,createdAt:ms(r.created_at)});
    if(rows[0]) return {inserted:true,record:from(rows[0])};
    const existing=await sql.query<Record<string,unknown>>("select * from trading_worker_reasoning where reason_id=$1",[record.reasonId]);
    if(!existing[0]) throw new Error("reasoning_insert_race_unresolved");
    return {inserted:false,record:from(existing[0])};
  }
  async listByTask(taskId:string) { const sql=await this.sql(); const rows=await sql.query<Record<string,unknown>>("select * from trading_worker_reasoning where task_id=$1 order by created_at asc,reason_id asc",[taskId]); return rows.map((r)=>({reasonId:String(r.reason_id),taskId:String(r.task_id),workerId:String(r.worker_id),taskType:String(r.task_type),provider:String(r.provider),modelId:String(r.model_id),policyVersion:String(r.policy_version),inputHash:String(r.input_hash),outputHash:String(r.output_hash),trace:(parse(r.trace)??{}) as Record<string,unknown>,createdAt:ms(r.created_at)})); }
}

export async function buildReasoningRecord(input:{taskId:string;workerId:string;taskType:string;provider:string;modelId:string;policyVersion:string;inputHash:string;trace:Record<string,unknown>;createdAt?:number}) : Promise<WorkerReasoningTraceRecord> {
  const createdAt=input.createdAt??Date.now();
  const outputHash=await stableHash(input.trace);
  const reasonId=`reason:${input.taskId}:${input.workerId}:${outputHash.slice(0,24)}`;
  return {...input,reasonId,outputHash,createdAt};
}

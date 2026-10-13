import { stableHash } from "../runtime/task-results.ts";

export type ResearchStage = "research" | "backtest" | "out_of_sample" | "walk_forward" | "paper" | "promoted" | "retired";
export type EvaluationPhase = "in_sample" | "out_of_sample" | "walk_forward" | "paper";

const transitions: Record<ResearchStage, ResearchStage[]> = {
  research: ["backtest", "retired"],
  backtest: ["out_of_sample", "retired"],
  out_of_sample: ["walk_forward", "retired"],
  walk_forward: ["paper", "retired"],
  paper: ["promoted", "retired"],
  promoted: ["retired"],
  retired: [],
};

export interface ResearchExperiment {
  experimentId: string;
  strategyId: string;
  parentExperimentId: string | null;
  stage: ResearchStage;
  spec: Record<string, unknown>;
  specHash: string;
  createdAt: number;
  finalizedAt: number | null;
}

export interface ResearchEvaluation {
  evaluationId: string;
  experimentId: string;
  phase: EvaluationPhase;
  windowStart: number;
  windowEnd: number;
  metrics: Record<string, number>;
  passed: boolean;
  resultHash: string;
  createdAt: number;
}

export interface ResearchExperimentStore {
  create(input: Omit<ResearchExperiment, "specHash" | "createdAt" | "finalizedAt">): Promise<ResearchExperiment>;
  get(experimentId: string): Promise<ResearchExperiment | null>;
  transition(experimentId: string, next: ResearchStage): Promise<ResearchExperiment>;
  addEvaluation(input: Omit<ResearchEvaluation, "resultHash" | "createdAt">): Promise<ResearchEvaluation>;
  listEvaluations(experimentId: string): Promise<ResearchEvaluation[]>;
}

function clone<T>(v: T): T { return structuredClone(v); }

export class InMemoryResearchExperimentStore implements ResearchExperimentStore {
  private readonly experiments = new Map<string, ResearchExperiment>();
  private readonly evaluations = new Map<string, ResearchEvaluation>();
  async create(input: Omit<ResearchExperiment, "specHash" | "createdAt" | "finalizedAt">) {
    if (this.experiments.has(input.experimentId)) throw new Error("experiment_exists");
    const experiment: ResearchExperiment = { ...input, parentExperimentId: input.parentExperimentId ?? null, specHash: await stableHash(input.spec), createdAt: Date.now(), finalizedAt: null };
    this.experiments.set(experiment.experimentId, clone(experiment));
    return clone(experiment);
  }
  async get(id: string) { return clone(this.experiments.get(id) ?? null); }
  async transition(id: string, next: ResearchStage) {
    const current = this.experiments.get(id); if (!current) throw new Error("experiment_not_found");
    if (!transitions[current.stage].includes(next)) throw new Error(`invalid_research_transition:${current.stage}->${next}`);
    current.stage = next; if (next === "promoted" || next === "retired") current.finalizedAt = Date.now();
    return clone(current);
  }
  async addEvaluation(input: Omit<ResearchEvaluation, "resultHash" | "createdAt">) {
    if (!this.experiments.has(input.experimentId)) throw new Error("experiment_not_found");
    const evaluation: ResearchEvaluation = { ...input, resultHash: await stableHash(input.metrics), createdAt: Date.now() };
    if (this.evaluations.has(evaluation.evaluationId)) throw new Error("evaluation_exists");
    this.evaluations.set(evaluation.evaluationId, clone(evaluation));
    return clone(evaluation);
  }
  async listEvaluations(id: string) { return [...this.evaluations.values()].filter((x) => x.experimentId === id).sort((a,b) => a.windowStart-b.windowStart || a.evaluationId.localeCompare(b.evaluationId)).map(clone); }
}

interface SqlLike { query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>; }
function json(v: unknown): string { return JSON.stringify(v); }
function parse(v: unknown): unknown { return typeof v === "string" ? JSON.parse(v) : v; }
function ms(v: unknown): number | null { return v == null ? null : new Date(String(v)).getTime(); }

export class SqlResearchExperimentStore implements ResearchExperimentStore {
  private sqlPromise: Promise<SqlLike> | null = null;
  private sql(): Promise<SqlLike> { this.sqlPromise ??= import("../../lib/db.ts").then(({ getSql }) => getSql()); return this.sqlPromise; }
  async create(input: Omit<ResearchExperiment, "specHash" | "createdAt" | "finalizedAt">) {
    const sql = await this.sql(); const createdAt = Date.now(); const specHash = await stableHash(input.spec);
    const rows = await sql.query<Record<string, unknown>>(`insert into trading_research_experiments (experiment_id,strategy_id,parent_experiment_id,stage,spec,spec_hash,created_at) values ($1,$2,$3,$4,$5::jsonb,$6,to_timestamp($7/1000.0)) returning *`, [input.experimentId,input.strategyId,input.parentExperimentId ?? null,input.stage,json(input.spec),specHash,createdAt]);
    return this.fromExperiment(rows[0]);
  }
  async get(id: string) { const sql=await this.sql(); const rows=await sql.query<Record<string,unknown>>("select * from trading_research_experiments where experiment_id=$1",[id]); return rows[0]?this.fromExperiment(rows[0]):null; }
  async transition(id: string, next: ResearchStage) { const current=await this.get(id); if(!current) throw new Error("experiment_not_found"); if(!transitions[current.stage].includes(next)) throw new Error(`invalid_research_transition:${current.stage}->${next}`); const sql=await this.sql(); const finalized=(next==="promoted"||next==="retired")?Date.now():null; const rows=await sql.query<Record<string,unknown>>("update trading_research_experiments set stage=$2, finalized_at=case when $3 is null then finalized_at else to_timestamp($3/1000.0) end where experiment_id=$1 returning *",[id,next,finalized]); return this.fromExperiment(rows[0]); }
  async addEvaluation(input: Omit<ResearchEvaluation, "resultHash" | "createdAt">) { const sql=await this.sql(); const createdAt=Date.now(); const resultHash=await stableHash(input.metrics); const rows=await sql.query<Record<string,unknown>>(`insert into trading_research_evaluations (evaluation_id,experiment_id,phase,window_start,window_end,metrics,passed,result_hash,created_at) values ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,to_timestamp($9/1000.0)) returning *`,[input.evaluationId,input.experimentId,input.phase,input.windowStart,input.windowEnd,json(input.metrics),input.passed,resultHash,createdAt]); return this.fromEvaluation(rows[0]); }
  async listEvaluations(id: string) { const sql=await this.sql(); const rows=await sql.query<Record<string,unknown>>("select * from trading_research_evaluations where experiment_id=$1 order by window_start asc,evaluation_id asc",[id]); return rows.map((r)=>this.fromEvaluation(r)); }
  private fromExperiment(r: Record<string,unknown>): ResearchExperiment { return { experimentId:String(r.experiment_id),strategyId:String(r.strategy_id),parentExperimentId:r.parent_experiment_id==null?null:String(r.parent_experiment_id),stage:String(r.stage) as ResearchStage,spec:parse(r.spec) as Record<string,unknown>,specHash:String(r.spec_hash),createdAt:ms(r.created_at)??0,finalizedAt:ms(r.finalized_at)}; }
  private fromEvaluation(r: Record<string,unknown>): ResearchEvaluation { return { evaluationId:String(r.evaluation_id),experimentId:String(r.experiment_id),phase:String(r.phase) as EvaluationPhase,windowStart:Number(r.window_start),windowEnd:Number(r.window_end),metrics:(parse(r.metrics)??{}) as Record<string,number>,passed:Boolean(r.passed),resultHash:String(r.result_hash),createdAt:ms(r.created_at)??0}; }
}

export { transitions as RESEARCH_TRANSITIONS };

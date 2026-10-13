import type { TaskQueue, TradingTask } from "./runtime/task-queue.ts";
import type { TradingWorkerRegistry } from "./runtime/worker-registry.ts";

export type DebateStance = "bull" | "bear" | "neutral" | "abstain";
export type DebateStatus = "open" | "finalized" | "rejected";
export type DebateRoundStatus = "open" | "closed";

export interface CouncilDefinition {
  id: string;
  name: string;
  family?: string;
  requiredCapability?: string;
  maxParticipants: number;
}

export const TRADING_COUNCILS: CouncilDefinition[] = [
  { id: "macro", name: "TITAN — Macro Council", family: "Macro", maxParticipants: 8 },
  { id: "fundamental", name: "ATLAS — Fundamental Council", family: "Fundamental", maxParticipants: 8 },
  { id: "technical", name: "VORTEX — Technical Council", family: "Technical", maxParticipants: 8 },
  { id: "quant", name: "QUANTUM — Quant Council", family: "Quant", maxParticipants: 8 },
  { id: "derivatives", name: "APEX — Derivatives Council", family: "Derivatives", maxParticipants: 8 },
  { id: "crypto", name: "NEXUS — Crypto Council", family: "Crypto", maxParticipants: 8 },
  { id: "news", name: "PULSE — News & Event Council", family: "News", requiredCapability: "news", maxParticipants: 8 },
  { id: "strategy", name: "FORGE — Strategy Lab Council", family: "Strategy", requiredCapability: "strategy", maxParticipants: 8 },
  { id: "risk", name: "AEGIS — Risk Council", family: "Risk", requiredCapability: "risk", maxParticipants: 8 },
  { id: "execution", name: "VECTOR — Execution Council", family: "Execution", maxParticipants: 8 },
  { id: "adversarial", name: "SENTINEL — Adversarial Council", family: "Adversarial", requiredCapability: "adversarial", maxParticipants: 8 },
  { id: "knowledge", name: "ARCHIVE — Evidence & Knowledge Council", family: "Knowledge", requiredCapability: "documentation", maxParticipants: 6 },
];

export interface DebateSession {
  sessionId: string;
  subjectId: string;
  topic: string;
  status: DebateStatus;
  currentRound: number;
  participants: string[];
  councilIds: string[];
  decision: DebateDecision | null;
  createdAt: number;
  updatedAt: number;
  finalizedAt: number | null;
}

export interface DebateRound {
  sessionId: string;
  round: number;
  status: DebateRoundStatus;
  openedAt: number;
  closedAt: number | null;
}

export interface DebateTurn {
  turnId: string;
  turnType?: "initial" | "critique";
  sessionId: string;
  round: number;
  workerId: string;
  stance: DebateStance;
  argument: string;
  evidenceIds: string[];
  confidence: number;
  challengeOfTurnIds: string[];
  createdAt: number;
}

export interface DebateDecision {
  stance: DebateStance;
  confidence: number;
  rationale: string;
  evidenceIds: string[];
  dissentWorkerIds: string[];
}

export interface DebateStore {
  createSession(session: DebateSession): Promise<DebateSession>;
  getSession(sessionId: string): Promise<DebateSession | null>;
  updateSession(session: DebateSession): Promise<DebateSession>;
  createRound(round: DebateRound): Promise<DebateRound>;
  getRound(sessionId: string, round: number): Promise<DebateRound | null>;
  updateRound(round: DebateRound): Promise<DebateRound>;
  recordTurn(turn: DebateTurn): Promise<{ inserted: boolean; turn: DebateTurn }>;
  listTurns(sessionId: string, round?: number): Promise<DebateTurn[]>;
}

function clone<T>(value: T): T { return structuredClone(value); }
function confidence(value: number): number { if (!Number.isFinite(value)) throw new Error("invalid_debate_confidence"); return Math.max(0, Math.min(1, value)); }

export class InMemoryDebateStore implements DebateStore {
  private readonly sessions = new Map<string, DebateSession>();
  private readonly rounds = new Map<string, DebateRound>();
  private readonly turns = new Map<string, DebateTurn>();

  async createSession(session: DebateSession): Promise<DebateSession> {
    if (this.sessions.has(session.sessionId)) throw new Error("debate_session_exists");
    const stored = clone(session);
    this.sessions.set(stored.sessionId, stored);
    return clone(stored);
  }

  async getSession(sessionId: string): Promise<DebateSession | null> {
    const stored = this.sessions.get(sessionId);
    return stored ? clone(stored) : null;
  }

  async updateSession(session: DebateSession): Promise<DebateSession> {
    const stored = clone(session);
    this.sessions.set(stored.sessionId, stored);
    return clone(stored);
  }

  async createRound(round: DebateRound): Promise<DebateRound> {
    const key = `${round.sessionId}:${round.round}`;
    if (this.rounds.has(key)) throw new Error("debate_round_exists");
    const stored = clone(round);
    this.rounds.set(key, stored);
    return clone(stored);
  }

  async getRound(sessionId: string, round: number): Promise<DebateRound | null> {
    const stored = this.rounds.get(`${sessionId}:${round}`);
    return stored ? clone(stored) : null;
  }

  async updateRound(round: DebateRound): Promise<DebateRound> {
    const key = `${round.sessionId}:${round.round}`;
    if (!this.rounds.has(key)) throw new Error("debate_round_not_found");
    const stored = clone(round);
    this.rounds.set(key, stored);
    return clone(stored);
  }

  async recordTurn(turn: DebateTurn): Promise<{ inserted: boolean; turn: DebateTurn }> {
    const turnType = turn.turnType ?? "initial";
    const existing = this.turns.get(turn.turnId) ?? [...this.turns.values()].find(
      (value) => value.sessionId === turn.sessionId && value.round === turn.round && value.workerId === turn.workerId && (value.turnType ?? "initial") === turnType,
    );
    if (existing) return { inserted: false, turn: clone(existing) };
    const stored = clone(turn);
    this.turns.set(stored.turnId, stored);
    return { inserted: true, turn: clone(stored) };
  }

  async listTurns(sessionId: string, round?: number): Promise<DebateTurn[]> {
    return [...this.turns.values()]
      .filter((turn) => turn.sessionId === sessionId && (round == null || turn.round === round))
      .sort((a, b) => a.createdAt - b.createdAt || a.workerId.localeCompare(b.workerId))
      .map(clone);
  }
}

interface SqlLike { query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>; }
function parseJson(value: unknown): any { return typeof value === "string" ? JSON.parse(value) : value; }
function ms(value: unknown): number | null { return value == null ? null : new Date(String(value)).getTime(); }

export class SqlDebateStore implements DebateStore {
  private sqlPromise: Promise<SqlLike> | null = null;
  private sql(): Promise<SqlLike> { this.sqlPromise ??= import("../lib/db.ts").then(({ getSql }) => getSql()); return this.sqlPromise; }
  async createSession(session: DebateSession) {
    const sql=await this.sql(); const rows=await sql.query<Record<string,unknown>>(`insert into trading_debate_sessions (session_id,subject_id,topic,status,current_round,participants,council_ids,decision,created_at,updated_at,finalized_at) values ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb,to_timestamp($9/1000.0),to_timestamp($10/1000.0),to_timestamp($11/1000.0)) returning *`, [session.sessionId,session.subjectId,session.topic,session.status,session.currentRound,JSON.stringify(session.participants),JSON.stringify(session.councilIds),JSON.stringify(session.decision),session.createdAt,session.updatedAt,session.finalizedAt]); if(!rows[0]) throw new Error("debate_session_insert_failed"); return fromSession(rows[0]);
  }
  async getSession(sessionId:string){const sql=await this.sql();const rows=await sql.query<Record<string,unknown>>("select * from trading_debate_sessions where session_id=$1",[sessionId]);return rows[0]?fromSession(rows[0]):null;}
  async updateSession(session:DebateSession){const sql=await this.sql();const rows=await sql.query<Record<string,unknown>>(`update trading_debate_sessions set status=$2,current_round=$3,participants=$4::jsonb,council_ids=$5::jsonb,decision=$6::jsonb,updated_at=to_timestamp($7/1000.0),finalized_at=to_timestamp($8/1000.0) where session_id=$1 returning *`,[session.sessionId,session.status,session.currentRound,JSON.stringify(session.participants),JSON.stringify(session.councilIds),JSON.stringify(session.decision),session.updatedAt,session.finalizedAt]);if(!rows[0])throw new Error("debate_session_update_failed");return fromSession(rows[0]);}
  async createRound(round:DebateRound){const sql=await this.sql();const rows=await sql.query<Record<string,unknown>>(`insert into trading_debate_rounds (session_id,round,status,opened_at,closed_at) values ($1,$2,$3,to_timestamp($4/1000.0),to_timestamp($5/1000.0)) returning *`,[round.sessionId,round.round,round.status,round.openedAt,round.closedAt]);if(!rows[0])throw new Error("debate_round_insert_failed");return fromRound(rows[0]);}
  async getRound(sessionId:string,round:number){const sql=await this.sql();const rows=await sql.query<Record<string,unknown>>("select * from trading_debate_rounds where session_id=$1 and round=$2",[sessionId,round]);return rows[0]?fromRound(rows[0]):null;}
  async updateRound(round:DebateRound){const sql=await this.sql();const rows=await sql.query<Record<string,unknown>>(`update trading_debate_rounds set status=$3,closed_at=to_timestamp($4/1000.0) where session_id=$1 and round=$2 returning *`,[round.sessionId,round.round,round.status,round.closedAt]);if(!rows[0])throw new Error("debate_round_update_failed");return fromRound(rows[0]);}
  async recordTurn(turn:DebateTurn){const sql=await this.sql();const rows=await sql.query<Record<string,unknown>>(`insert into trading_debate_turns (turn_id,session_id,round,worker_id,turn_type,stance,argument,evidence_ids,confidence,challenge_turn_ids,created_at) values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10::jsonb,to_timestamp($11/1000.0)) on conflict (session_id,round,worker_id,turn_type) do nothing returning *`,[turn.turnId,turn.sessionId,turn.round,turn.workerId,turn.turnType ?? "initial",turn.stance,turn.argument,JSON.stringify(turn.evidenceIds),turn.confidence,JSON.stringify(turn.challengeOfTurnIds),turn.createdAt]);const from=(r:Record<string,unknown>):DebateTurn=>({turnId:String(r.turn_id),sessionId:String(r.session_id),round:Number(r.round),workerId:String(r.worker_id),turnType:(String(r.turn_type ?? "initial") as "initial" | "critique"),stance:String(r.stance) as DebateStance,argument:String(r.argument),evidenceIds:(parseJson(r.evidence_ids)??[]) as string[],confidence:Number(r.confidence),challengeOfTurnIds:(parseJson(r.challenge_turn_ids)??[]) as string[],createdAt:ms(r.created_at)??0});if(rows[0])return{inserted:true,turn:from(rows[0])};const existing=await sql.query<Record<string,unknown>>("select * from trading_debate_turns where session_id=$1 and round=$2 and worker_id=$3 and turn_type=$4",[turn.sessionId,turn.round,turn.workerId,turn.turnType ?? "initial"]);if(!existing[0])throw new Error("debate_turn_insert_race_unresolved");return{inserted:false,turn:from(existing[0])};}
  async listTurns(sessionId:string,round?:number){const sql=await this.sql();const params:[unknown,...unknown[]]=[sessionId];const where=round==null?"":(params.push(round)," and round=$2");const rows=await sql.query<Record<string,unknown>>(`select * from trading_debate_turns where session_id=$1${where} order by created_at asc, worker_id asc`,params);return rows.map((r)=>({turnId:String(r.turn_id),sessionId:String(r.session_id),round:Number(r.round),workerId:String(r.worker_id),turnType:(String(r.turn_type ?? "initial") as "initial" | "critique"),stance:String(r.stance) as DebateStance,argument:String(r.argument),evidenceIds:(parseJson(r.evidence_ids)??[]) as string[],confidence:Number(r.confidence),challengeOfTurnIds:(parseJson(r.challenge_turn_ids)??[]) as string[],createdAt:ms(r.created_at)??0}));}
}
function fromSession(r:Record<string,unknown>):DebateSession{return{sessionId:String(r.session_id),subjectId:String(r.subject_id),topic:String(r.topic),status:String(r.status) as DebateStatus,currentRound:Number(r.current_round),participants:(parseJson(r.participants)??[]) as string[],councilIds:(parseJson(r.council_ids)??[]) as string[],decision:(parseJson(r.decision)??null) as DebateDecision|null,createdAt:ms(r.created_at)??0,updatedAt:ms(r.updated_at)??0,finalizedAt:ms(r.finalized_at)};}
function fromRound(r:Record<string,unknown>):DebateRound{return{sessionId:String(r.session_id),round:Number(r.round),status:String(r.status) as DebateRoundStatus,openedAt:ms(r.opened_at)??0,closedAt:ms(r.closed_at)};}

export interface DebateCoordinatorOptions {
  maxParticipants?: number;
  minTurnsToClose?: number;
}

export class DebateCoordinator {
  private readonly store: DebateStore;
  private readonly registry: TradingWorkerRegistry;
  private readonly queue: TaskQueue;

  constructor(store: DebateStore, registry: TradingWorkerRegistry, queue: TaskQueue) {
    this.store = store;
    this.registry = registry;
    this.queue = queue;
  }

  async createSession(input: { sessionId: string; subjectId: string; topic: string; councilIds?: string[]; participantQuery?: { market?: string }; now?: number; maxParticipants?: number }): Promise<DebateSession> {
    const now=input.now??Date.now();
    const councils=(input.councilIds??TRADING_COUNCILS.map((c)=>c.id)).filter((id, index, all)=>all.indexOf(id)===index);
    const maxParticipants=Math.min(128, Math.max(2, input.maxParticipants??32));
    const selectedWorkers = new Map<string, Awaited<ReturnType<TradingWorkerRegistry["list"]>>[number]>();
    for (const councilId of councils) {
      const council=TRADING_COUNCILS.find((value)=>value.id===councilId);
      if (!council) continue;
      const query={ family:council.family, capability:council.requiredCapability, ...(input.participantQuery?.market ? {market:input.participantQuery.market}: {}) };
      const workers=await this.registry.list(query);
      for (const worker of workers.slice(0, council.maxParticipants)) selectedWorkers.set(worker.workerId, worker);
    }
    const participants=[...selectedWorkers.values()].slice(0,maxParticipants).map((w)=>w.workerId);
    if(participants.length<2)throw new Error("debate_requires_two_participants");
    const session:DebateSession={sessionId:input.sessionId,subjectId:input.subjectId,topic:input.topic,status:"open",currentRound:0,participants,councilIds:councils,decision:null,createdAt:now,updatedAt:now,finalizedAt:null};
    return this.store.createSession(session);
  }

  async openRound(sessionId:string, round?:number, now=Date.now(), evidenceIds:string[]=[]):Promise<{round:DebateRound; tasks:TradingTask[]}> {
    const session=await this.requireSession(sessionId); const number=round??session.currentRound+1;
    if(number!==session.currentRound+1)throw new Error("debate_round_must_be_sequential");
    if(await this.store.getRound(sessionId,number))throw new Error("debate_round_exists");
    const created=await this.store.createRound({sessionId,round:number,status:"open",openedAt:now,closedAt:null});
    const tasks:TradingTask[]=[];
    for(const workerId of session.participants){const task=await this.queue.enqueue({id:`debate-turn:${sessionId}:${number}:${workerId}`,type:"debate.turn",payload:{sessionId,round:number,subjectId:session.subjectId,topic:session.topic,workerId,evidenceIds:[...evidenceIds]},routing:{preferredWorkerId:workerId},priority:50,maxAttempts:5});tasks.push(task.task);}
    session.currentRound=number; session.updatedAt=now; await this.store.updateSession(session);
    return{round:created,tasks};
  }

  async scheduleCritiques(sessionId:string, round:number, evidenceIds:string[]=[]):Promise<TradingTask[]>{
    const session=await this.requireSession(sessionId);
    const current=await this.store.getRound(sessionId,round);
    if(!current || current.status!=="open")throw new Error("debate_round_not_open");
    const turns=await this.store.listTurns(sessionId,round);
    if(!turns.length)throw new Error("debate_insufficient_turns_for_critique");
    const priorTurnIds=turns.filter((turn)=>turn.turnType !== "critique").map((turn)=>turn.turnId);
    const priorArguments=turns.filter((turn)=>turn.turnType !== "critique").map((turn)=>turn.argument);
    const tasks:TradingTask[]=[];
    for(const workerId of session.participants){
      const task=await this.queue.enqueue({
        id:`debate-critique:${sessionId}:${round}:${workerId}`,
        type:"debate.critique",
        payload:{sessionId,round,subjectId:session.subjectId,topic:session.topic,workerId,evidenceIds:[...evidenceIds],priorTurnIds,priorArguments},
        routing:{preferredWorkerId:workerId},priority:55,maxAttempts:5,
      });
      tasks.push(task.task);
    }
    return tasks;
  }

  async recordTurn(input: Omit<DebateTurn,"createdAt"> & {createdAt?:number}){
    if(!Number.isFinite(input.confidence) || input.confidence<0 || input.confidence>1)throw new Error("invalid_debate_confidence");
    const session=await this.requireSession(input.sessionId); if(session.status!=="open")throw new Error("debate_not_open");
    const round=await this.store.getRound(input.sessionId,input.round); if(!round || round.status!=="open")throw new Error("debate_round_not_open");
    if(!session.participants.includes(input.workerId))throw new Error("debate_worker_not_participant");
    return this.store.recordTurn({...input,createdAt:input.createdAt??Date.now(),confidence:confidence(input.confidence)});
  }

  async closeRound(sessionId:string,round:number,now=Date.now(),minTurns=2):Promise<DebateRound>{
    const current=await this.store.getRound(sessionId,round); if(!current || current.status!=="open")throw new Error("debate_round_not_open");
    const turns=await this.store.listTurns(sessionId,round); if(turns.length<Math.max(1,minTurns))throw new Error("debate_insufficient_turns");
    return this.store.updateRound({...current,status:"closed",closedAt:now});
  }

  async finalize(sessionId:string,decision:DebateDecision,now=Date.now()):Promise<DebateSession>{
    const session=await this.requireSession(sessionId); if(session.status!=="open")throw new Error("debate_not_open");
    const round=await this.store.getRound(sessionId,session.currentRound); if(!round || round.status!=="closed")throw new Error("debate_current_round_not_closed");
    if(!decision.rationale.trim())throw new Error("debate_rationale_required");
    session.status="finalized";session.decision={...decision,confidence:confidence(decision.confidence)};session.finalizedAt=now;session.updatedAt=now;return this.store.updateSession(session);
  }

  private async requireSession(sessionId:string){const session=await this.store.getSession(sessionId);if(!session)throw new Error("debate_session_not_found");return session;}
}

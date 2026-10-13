import type { TaskQueue, TaskRoutingHints, TradingTask } from "./runtime/task-queue.ts";
import type { TradingWorkerRegistry } from "./runtime/worker-registry.ts";
import { stableHash } from "./runtime/task-results.ts";
import type { EvidenceQuality } from "./evidence-quality.ts";

export interface TradingEvidencePacket<T = unknown> {
  evidenceId: string;
  subjectId: string;
  evidenceType: string;
  claim: string;
  confidence: number;
  source: string;
  eventTs: number;
  publishedTs: number | null;
  retrievedTs: number;
  payload: T;
  provenance: Record<string, unknown>;
  quality?: EvidenceQuality;
  contentHash: string;
}

export interface EvidenceQuery {
  subjectId?: string;
  evidenceType?: string;
  minConfidence?: number;
  minQuality?: number;
  sinceTs?: number;
  limit?: number;
}

export interface EvidenceStore {
  append<T>(packet: TradingEvidencePacket<T>): Promise<{ inserted: boolean; packet: TradingEvidencePacket<T> }>;
  get<T = unknown>(evidenceId: string): Promise<TradingEvidencePacket<T> | null>;
  list<T = unknown>(query?: EvidenceQuery): Promise<TradingEvidencePacket<T>[]>;
}

function clone<T>(value: T): T { return structuredClone(value); }

function clampConfidence(value: number): number {
  if (!Number.isFinite(value)) throw new Error("invalid_evidence_confidence");
  return Math.max(0, Math.min(1, value));
}

export async function buildEvidencePacket<T>(input: {
  evidenceId: string;
  subjectId: string;
  evidenceType: string;
  claim: string;
  confidence: number;
  source: string;
  eventTs: number;
  publishedTs?: number | null;
  retrievedTs?: number;
  availableTs?: number | null;
  payload: T;
  provenance?: Record<string, unknown>;
  quality?: EvidenceQuality;
}): Promise<TradingEvidencePacket<T>> {
  if (!input.evidenceId.trim()) throw new Error("evidence_id_required");
  if (!input.subjectId.trim()) throw new Error("evidence_subject_required");
  if (!input.evidenceType.trim()) throw new Error("evidence_type_required");
  if (!input.claim.trim()) throw new Error("evidence_claim_required");
  if (!input.source.trim()) throw new Error("evidence_source_required");
  const retrievedTs = input.retrievedTs ?? Date.now();
  if (![input.eventTs, retrievedTs].every(Number.isFinite)) throw new Error('invalid_evidence_timestamp');
  if (input.publishedTs != null && (!Number.isFinite(input.publishedTs) || input.publishedTs < input.eventTs || input.publishedTs > retrievedTs)) throw new Error('invalid_evidence_publication_time');
  if (input.availableTs != null && (!Number.isFinite(input.availableTs) || input.availableTs < (input.publishedTs ?? input.eventTs) || input.availableTs > retrievedTs)) throw new Error('invalid_evidence_availability_time');
  const base = {
    evidenceId: input.evidenceId,
    subjectId: input.subjectId,
    evidenceType: input.evidenceType,
    claim: input.claim,
    confidence: clampConfidence(input.confidence),
    source: input.source,
    eventTs: input.eventTs,
    publishedTs: input.publishedTs ?? null,
    retrievedTs,
    payload: input.payload,
    provenance: input.provenance ?? {},
    quality: input.quality,
  };
  return { ...base, contentHash: await stableHash(base) };
}

export class InMemoryEvidenceStore implements EvidenceStore {
  private readonly packets = new Map<string, TradingEvidencePacket>();
  async append<T>(packet: TradingEvidencePacket<T>) {
    const existing = this.packets.get(packet.evidenceId);
    if (existing) return { inserted: false, packet: clone(existing) as TradingEvidencePacket<T> };
    this.packets.set(packet.evidenceId, clone(packet));
    return { inserted: true, packet: clone(packet) };
  }
  async get<T = unknown>(evidenceId: string) {
    const packet = this.packets.get(evidenceId);
    return packet ? clone(packet) as TradingEvidencePacket<T> : null;
  }
  async list<T = unknown>(query: EvidenceQuery = {}) {
    return [...this.packets.values()]
      .filter((p) => !query.subjectId || p.subjectId === query.subjectId)
      .filter((p) => !query.evidenceType || p.evidenceType === query.evidenceType)
      .filter((p) => query.minConfidence == null || p.confidence >= query.minConfidence)
      .filter((p) => query.minQuality == null || (p.quality?.score ?? 0) >= query.minQuality)
      .filter((p) => query.sinceTs == null || p.eventTs >= query.sinceTs)
      .sort((a, b) => b.eventTs - a.eventTs || a.evidenceId.localeCompare(b.evidenceId))
      .slice(0, Math.min(1_000, Math.max(1, query.limit ?? 100)))
      .map(clone) as TradingEvidencePacket<T>[];
  }
}

interface SqlLike { query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>; }
function parseJson(value: unknown): unknown { return typeof value === "string" ? JSON.parse(value) : value; }
function ms(value: unknown): number | null { return value == null ? null : new Date(String(value)).getTime(); }
function fromRow(row: Record<string, unknown>): TradingEvidencePacket {
  return {
    evidenceId: String(row.evidence_id),
    subjectId: String(row.subject_id),
    evidenceType: String(row.evidence_type),
    claim: String(row.claim),
    confidence: Number(row.confidence),
    source: String(row.source),
    eventTs: Number(row.event_ts),
    publishedTs: ms(row.published_at),
    retrievedTs: ms(row.retrieved_at) ?? 0,
    payload: parseJson(row.payload),
    provenance: (parseJson(row.provenance) ?? {}) as Record<string, unknown>,
    quality: parseJson(row.quality) as EvidenceQuality | undefined,
    contentHash: String(row.content_hash),
  };
}

export class SqlEvidenceStore implements EvidenceStore {
  private sqlPromise: Promise<SqlLike> | null = null;
  private sql(): Promise<SqlLike> { this.sqlPromise ??= import("../lib/db.ts").then(({ getSql }) => getSql()); return this.sqlPromise; }
  async append<T>(packet: TradingEvidencePacket<T>) {
    const sql = await this.sql();
    const rows = await sql.query<Record<string, unknown>>(
      `insert into trading_evidence_packets
       (evidence_id, subject_id, evidence_type, claim, confidence, source, event_ts, published_at, retrieved_at, payload, provenance, quality, content_hash)
       values ($1,$2,$3,$4,$5,$6,$7,to_timestamp($8/1000.0),to_timestamp($9/1000.0),$10::jsonb,$11::jsonb,$12::jsonb,$13)
       on conflict (evidence_id) do nothing returning *`,
      [packet.evidenceId, packet.subjectId, packet.evidenceType, packet.claim, packet.confidence, packet.source, packet.eventTs, packet.publishedTs, packet.retrievedTs, JSON.stringify(packet.payload), JSON.stringify(packet.provenance), JSON.stringify(packet.quality ?? null), packet.contentHash],
    );
    if (rows[0]) return { inserted: true, packet: fromRow(rows[0]) as TradingEvidencePacket<T> };
    const existing = await this.get<T>(packet.evidenceId);
    if (!existing) throw new Error("evidence_insert_race_unresolved");
    return { inserted: false, packet: existing };
  }
  async get<T = unknown>(evidenceId: string) {
    const sql = await this.sql();
    const rows = await sql.query<Record<string, unknown>>("select * from trading_evidence_packets where evidence_id=$1 limit 1", [evidenceId]);
    return rows[0] ? fromRow(rows[0]) as TradingEvidencePacket<T> : null;
  }
  async list<T = unknown>(query: EvidenceQuery = {}) {
    const sql = await this.sql();
    const params: unknown[] = [];
    const where: string[] = [];
    if (query.subjectId) { params.push(query.subjectId); where.push(`subject_id=$${params.length}`); }
    if (query.evidenceType) { params.push(query.evidenceType); where.push(`evidence_type=$${params.length}`); }
    if (query.minConfidence != null) { params.push(query.minConfidence); where.push(`confidence >= $${params.length}`); }
    if (query.minQuality != null) { params.push(query.minQuality); where.push(`coalesce((quality->>'score')::double precision,0) >= $${params.length}`); }
    if (query.sinceTs != null) { params.push(query.sinceTs); where.push(`event_ts >= $${params.length}`); }
    params.push(Math.min(1_000, Math.max(1, query.limit ?? 100)));
    const rows = await sql.query<Record<string, unknown>>(
      `select * from trading_evidence_packets ${where.length ? `where ${where.join(" and ")}` : ""} order by event_ts desc, evidence_id asc limit $${params.length}`,
      params,
    );
    return rows.map(fromRow) as TradingEvidencePacket<T>[];
  }
}

export interface EvidenceFanoutRecord {
  fanoutId: string;
  evidenceId: string;
  workerId: string;
  taskId: string;
  routing: TaskRoutingHints;
  createdAt: number;
}

export interface EvidenceFanoutStore {
  record(record: EvidenceFanoutRecord): Promise<{ inserted: boolean; record: EvidenceFanoutRecord }>;
  list(evidenceId: string): Promise<EvidenceFanoutRecord[]>;
}

export class InMemoryEvidenceFanoutStore implements EvidenceFanoutStore {
  private readonly records = new Map<string, EvidenceFanoutRecord>();
  async record(record: EvidenceFanoutRecord) {
    const existing = this.records.get(record.fanoutId);
    if (existing) return { inserted: false, record: clone(existing) };
    this.records.set(record.fanoutId, clone(record));
    return { inserted: true, record: clone(record) };
  }
  async list(evidenceId: string) {
    return [...this.records.values()].filter((r) => r.evidenceId === evidenceId).sort((a, b) => a.workerId.localeCompare(b.workerId)).map(clone);
  }
}

export class SqlEvidenceFanoutStore implements EvidenceFanoutStore {
  private sqlPromise: Promise<SqlLike> | null = null;
  private sql(): Promise<SqlLike> { this.sqlPromise ??= import("../lib/db.ts").then(({ getSql }) => getSql()); return this.sqlPromise; }
  async record(record: EvidenceFanoutRecord) {
    const sql = await this.sql();
    const rows = await sql.query<Record<string, unknown>>(
      `insert into trading_evidence_fanout (fanout_id,evidence_id,worker_id,task_id,routing,created_at)
       values ($1,$2,$3,$4,$5::jsonb,to_timestamp($6/1000.0))
       on conflict (evidence_id, worker_id) do nothing returning *`,
      [record.fanoutId, record.evidenceId, record.workerId, record.taskId, JSON.stringify(record.routing), record.createdAt],
    );
    const toRecord = (row: Record<string, unknown>): EvidenceFanoutRecord => ({ fanoutId: String(row.fanout_id), evidenceId: String(row.evidence_id), workerId: String(row.worker_id), taskId: String(row.task_id), routing: (parseJson(row.routing) ?? {}) as TaskRoutingHints, createdAt: ms(row.created_at) ?? 0 });
    if (rows[0]) return { inserted: true, record: toRecord(rows[0]) };
    const existing = await sql.query<Record<string, unknown>>("select * from trading_evidence_fanout where evidence_id=$1 and worker_id=$2", [record.evidenceId, record.workerId]);
    if (!existing[0]) throw new Error("evidence_fanout_insert_race_unresolved");
    return { inserted: false, record: toRecord(existing[0]) };
  }
  async list(evidenceId: string) {
    const sql = await this.sql();
    const rows = await sql.query<Record<string, unknown>>("select * from trading_evidence_fanout where evidence_id=$1 order by worker_id", [evidenceId]);
    return rows.map((row) => ({ fanoutId: String(row.fanout_id), evidenceId: String(row.evidence_id), workerId: String(row.worker_id), taskId: String(row.task_id), routing: (parseJson(row.routing) ?? {}) as TaskRoutingHints, createdAt: ms(row.created_at) ?? 0 }));
  }
}

export interface EvidenceFanoutOptions {
  maxRecipients?: number;
  routing?: TaskRoutingHints;
  priority?: number;
  maxAttempts?: number;
  includeBusy?: boolean;
}

export class EvidenceFanoutService {
  private readonly evidence: EvidenceStore;
  private readonly queue: TaskQueue;
  private readonly registry: TradingWorkerRegistry;
  private readonly fanout: EvidenceFanoutStore;

  constructor(evidence: EvidenceStore, queue: TaskQueue, registry: TradingWorkerRegistry, fanout: EvidenceFanoutStore) {
    this.evidence = evidence;
    this.queue = queue;
    this.registry = registry;
    this.fanout = fanout;
  }

  async publish<T>(packet: TradingEvidencePacket<T>, options: EvidenceFanoutOptions = {}): Promise<{ inserted: boolean; workerIds: string[]; tasks: TradingTask[] }> {
    const stored = await this.evidence.append(packet);
    const routing = { ...(options.routing ?? {}) };
    const workers = await this.registry.list({
      family: routing.family,
      market: routing.market,
      capability: routing.requiredCapability,
      availableOnly: options.includeBusy ? false : true,
    });
    const selected = workers.slice(0, Math.min(256, Math.max(1, options.maxRecipients ?? 16)));
    const tasks: TradingTask[] = [];
    for (const worker of selected) {
      const taskId = `evidence-review:${packet.evidenceId}:${worker.workerId}`;
      const taskInput = {
        id: taskId,
        type: "evidence.review",
        payload: { evidence: stored.packet, workerId: worker.workerId, routing },
        routing: { ...routing, preferredWorkerId: worker.workerId },
        priority: options.priority ?? 0,
        maxAttempts: options.maxAttempts ?? 5,
        availableAt: packet.retrievedTs,
      };
      const enqueued = await this.queue.enqueue(taskInput);
      await this.fanout.record({
        fanoutId: `fanout:${packet.evidenceId}:${worker.workerId}`,
        evidenceId: packet.evidenceId,
        workerId: worker.workerId,
        taskId,
        routing: taskInput.routing,
        createdAt: packet.retrievedTs,
      });
      tasks.push(enqueued.task);
    }
    return { inserted: stored.inserted, workerIds: selected.map((worker) => worker.workerId), tasks };
  }
}

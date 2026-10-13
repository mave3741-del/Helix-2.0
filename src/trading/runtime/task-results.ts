export interface TradingTaskProvenance {
  taskId: string;
  workerId: string;
  registryId: string;
  attempt: number;
  taskType: string;
  inputHash: string;
  outputHash: string;
  startedAt: number;
  completedAt: number;
  executor: string;
}

export interface TradingTaskResult<TOutput = unknown> {
  resultId: string;
  taskId: string;
  workerId: string;
  attempt: number;
  ok: boolean;
  startedAt: number;
  completedAt: number;
  durationMs: number;
  output: TOutput;
  provenance: TradingTaskProvenance;
  provenanceHash: string;
}

export interface TaskResultStore {
  record<T>(result: TradingTaskResult<T>): Promise<{ inserted: boolean; result: TradingTaskResult<T> }>;
  get(taskId: string, attempt?: number): Promise<TradingTaskResult | null>;
  listByWorker(workerId: string, limit?: number): Promise<TradingTaskResult[]>;
}

function clone<T>(v: T): T { return structuredClone(v); }

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(object[key])}`).join(",")}}`;
}

export async function stableHash(value: unknown): Promise<string> {
  const text = typeof value === "string" ? value : stableStringify(value);
  const bytes = new TextEncoder().encode(text);
  if (globalThis.crypto?.subtle) {
    const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  let a = 0x811c9dc5;
  for (const byte of bytes) { a ^= byte; a = Math.imul(a, 0x01000193); }
  return (a >>> 0).toString(16).padStart(8, "0");
}

export class InMemoryTaskResultStore implements TaskResultStore {
  private readonly results = new Map<string, TradingTaskResult>();
  async record<T>(result: TradingTaskResult<T>) {
    const existing = this.results.get(result.resultId);
    if (existing) return { inserted: false, result: clone(existing) as TradingTaskResult<T> };
    this.results.set(result.resultId, clone(result));
    return { inserted: true, result: clone(result) };
  }
  async get(taskId: string, attempt?: number) {
    const result = [...this.results.values()].find((r) => r.taskId === taskId && (attempt == null || r.attempt === attempt));
    return result ? clone(result) : null;
  }
  async listByWorker(workerId: string, limit = 100) {
    return [...this.results.values()].filter((r) => r.workerId === workerId).sort((a,b) => b.completedAt - a.completedAt).slice(0, limit).map(clone);
  }
}

interface SqlLike { query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>; }
function fromRow(row: Record<string, unknown>): TradingTaskResult {
  const ms = (v: unknown) => new Date(String(v)).getTime();
  const decode = (v: unknown) => typeof v === "string" ? JSON.parse(v) : v;
  return {
    resultId: String(row.result_id), taskId: String(row.task_id), workerId: String(row.worker_id), attempt: Number(row.attempt_count),
    ok: Boolean(row.ok), startedAt: ms(row.started_at), completedAt: ms(row.completed_at), durationMs: Number(row.duration_ms),
    output: decode(row.output), provenance: decode(row.provenance) as TradingTaskProvenance, provenanceHash: String(row.provenance_hash),
  };
}

export class SqlTaskResultStore implements TaskResultStore {
  private sqlPromise: Promise<SqlLike> | null = null;
  private sql(): Promise<SqlLike> { this.sqlPromise ??= import("../../lib/db.ts").then(({ getSql }) => getSql()); return this.sqlPromise; }
  async record<T>(result: TradingTaskResult<T>) {
    const sql = await this.sql();
    const rows = await sql.query<Record<string, unknown>>(
      `insert into trading_task_results
        (result_id, task_id, worker_id, attempt_count, ok, started_at, completed_at, duration_ms, output, provenance, provenance_hash)
       values ($1,$2,$3,$4,$5,to_timestamp($6/1000.0),to_timestamp($7/1000.0),$8,$9::jsonb,$10::jsonb,$11)
       on conflict (task_id, attempt_count) do nothing returning *`,
      [result.resultId,result.taskId,result.workerId,result.attempt,result.ok,result.startedAt,result.completedAt,result.durationMs,JSON.stringify(result.output),JSON.stringify(result.provenance),result.provenanceHash],
    );
    if (rows[0]) return { inserted: true, result: fromRow(rows[0]) as TradingTaskResult<T> };
    const existing = await this.get(result.taskId, result.attempt);
    if (!existing) throw new Error("task_result_insert_race_unresolved");
    return { inserted: false, result: existing as TradingTaskResult<T> };
  }
  async get(taskId: string, attempt?: number) {
    const sql = await this.sql();
    const params: unknown[] = [taskId];
    const where = attempt == null ? "" : " and attempt_count = $2";
    if (attempt != null) params.push(attempt);
    const rows = await sql.query<Record<string, unknown>>(`select * from trading_task_results where task_id=$1${where} order by attempt_count desc limit 1`, params);
    return rows[0] ? fromRow(rows[0]) : null;
  }
  async listByWorker(workerId: string, limit = 100) {
    const sql = await this.sql();
    const rows = await sql.query<Record<string, unknown>>("select * from trading_task_results where worker_id=$1 order by completed_at desc limit $2", [workerId, limit]);
    return rows.map(fromRow);
  }
}

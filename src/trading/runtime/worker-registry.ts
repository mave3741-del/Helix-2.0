import { TRADING_SPECIALIZATIONS, tradingProfile } from "../workforce.ts";

export type TradingWorkerStatus = "available" | "busy" | "suspended" | "disabled";

export interface TradingWorkerIdentity {
  workerId: string;
  registryId: string;
  workerNumber: number;
  specializationId: string;
  specializationName: string;
  family: string;
  markets: string[];
  methods: string[];
  capabilities: string[];
  focus: string;
  status: TradingWorkerStatus;
  modelId: string;
  policyVersion: string;
  workload: number;
  heartbeatAt: number | null;
  lastTaskId: string | null;
  completedTasks: number;
  failedTasks: number;
  totalLatencyMs: number;
  totalTokens: number;
  lastError: string | null;
}

export interface WorkerRegistryQuery {
  family?: string;
  market?: string;
  capability?: string;
  availableOnly?: boolean;
}

export interface TradingWorkerRegistry {
  ensureSeeded(now?: number): Promise<number>;
  list(query?: WorkerRegistryQuery): Promise<TradingWorkerIdentity[]>;
  get(workerId: string): Promise<TradingWorkerIdentity | null>;
  markBusy(workerId: string, taskId: string, now?: number): Promise<boolean>;
  heartbeat(workerId: string, taskId: string, now?: number): Promise<boolean>;
  recordResult(input: { workerId: string; taskId: string; ok: boolean; durationMs: number; tokens?: number; error?: string; now?: number }): Promise<boolean>;
  release(workerId: string, taskId: string, now?: number): Promise<boolean>;
  recoverStale(now?: number, staleMs?: number): Promise<number>;
}

export function buildDeterministicTradingWorkerRegistry(now = Date.now()): TradingWorkerIdentity[] {
  const workers: TradingWorkerIdentity[] = [];
  for (let n = 1; n <= 1000; n += 1) {
    const spec = tradingProfile(n - 1);
    const modelId = n % 17 === 0 ? "open-reasoner" : n % 5 === 0 ? "grok-fast" : "local-heuristic";
    workers.push({
      workerId: `W-${String(n).padStart(4, "0")}`,
      registryId: `WORKER-${String(n).padStart(4, "0")}`,
      workerNumber: n,
      specializationId: spec.id,
      specializationName: spec.name,
      family: spec.family,
      markets: [...spec.markets],
      methods: [...spec.methods],
      capabilities: [...spec.capabilities, "trading"].filter((v, i, a) => a.indexOf(v) === i),
      focus: spec.focus,
      status: "available",
      modelId,
      policyVersion: "1.1.0",
      workload: 0,
      heartbeatAt: now,
      lastTaskId: null,
      completedTasks: 0,
      failedTasks: 0,
      totalLatencyMs: 0,
      totalTokens: 0,
      lastError: null,
    });
  }
  if (workers.length !== 1000 || TRADING_SPECIALIZATIONS.length < 1) throw new Error("trading_worker_registry_1000_invariant_failed");
  return workers;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

export class InMemoryTradingWorkerRegistry implements TradingWorkerRegistry {
  private readonly workers = new Map<string, TradingWorkerIdentity>();

  async ensureSeeded(now = Date.now()): Promise<number> {
    if (this.workers.size === 1000) return 0;
    const generated = buildDeterministicTradingWorkerRegistry(now);
    let inserted = 0;
    for (const worker of generated) {
      if (!this.workers.has(worker.workerId)) {
        this.workers.set(worker.workerId, clone(worker));
        inserted += 1;
      }
    }
    return inserted;
  }

  async list(query: WorkerRegistryQuery = {}): Promise<TradingWorkerIdentity[]> {
    const result = [...this.workers.values()]
      .filter((worker) => !query.family || worker.family === query.family)
      .filter((worker) => !query.market || worker.markets.includes(query.market) || worker.markets.includes("all"))
      .filter((worker) => !query.capability || worker.capabilities.includes(query.capability))
      .filter((worker) => !query.availableOnly || worker.status === "available")
      .sort((a, b) => a.workload - b.workload || a.workerNumber - b.workerNumber);
    return result.map(clone);
  }

  async get(workerId: string) { const worker = this.workers.get(workerId); return worker ? clone(worker) : null; }

  async markBusy(workerId: string, taskId: string, now = Date.now()): Promise<boolean> {
    const worker = this.workers.get(workerId);
    if (!worker || worker.status !== "available" || worker.workload > 0) return false;
    worker.status = "busy"; worker.workload = 1; worker.lastTaskId = taskId; worker.heartbeatAt = now;
    return true;
  }

  async heartbeat(workerId: string, taskId: string, now = Date.now()): Promise<boolean> {
    const worker = this.workers.get(workerId);
    if (!worker || worker.status !== "busy" || worker.lastTaskId !== taskId) return false;
    worker.heartbeatAt = now;
    return true;
  }

  async recordResult(input: { workerId: string; taskId: string; ok: boolean; durationMs: number; tokens?: number; error?: string; now?: number }): Promise<boolean> {
    const worker = this.workers.get(input.workerId);
    if (!worker || worker.lastTaskId !== input.taskId) return false;
    worker.completedTasks += input.ok ? 1 : 0;
    worker.failedTasks += input.ok ? 0 : 1;
    worker.totalLatencyMs += Math.max(0, Math.round(input.durationMs));
    worker.totalTokens += Math.max(0, Math.round(input.tokens ?? 0));
    worker.lastError = input.ok ? null : (input.error ?? "worker_task_failed").slice(0, 2000);
    worker.heartbeatAt = input.now ?? Date.now();
    return true;
  }

  async release(workerId: string, taskId: string, now = Date.now()): Promise<boolean> {
    const worker = this.workers.get(workerId);
    if (!worker || worker.lastTaskId !== taskId) return false;
    worker.status = "available"; worker.workload = 0; worker.heartbeatAt = now;
    return true;
  }

  async recoverStale(now = Date.now(), staleMs = 30_000): Promise<number> {
    let recovered = 0;
    for (const worker of this.workers.values()) {
      if (worker.status === "busy" && worker.heartbeatAt !== null && worker.heartbeatAt + staleMs <= now) {
        worker.status = "available"; worker.workload = 0; worker.heartbeatAt = now; worker.lastError = worker.lastError ?? "worker_lease_stale";
        recovered += 1;
      }
    }
    return recovered;
  }
}

interface SqlLike {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
}

function fromRow(row: Record<string, unknown>): TradingWorkerIdentity {
  const ms = (v: unknown) => v == null ? null : new Date(String(v)).getTime();
  const jsonArray = (v: unknown): string[] => typeof v === "string" ? JSON.parse(v) : Array.isArray(v) ? v.map(String) : [];
  return {
    workerId: String(row.worker_id), registryId: String(row.registry_id), workerNumber: Number(row.worker_number),
    specializationId: String(row.specialization_id), specializationName: String(row.specialization_name), family: String(row.family),
    markets: jsonArray(row.markets), methods: jsonArray(row.methods), capabilities: jsonArray(row.capabilities), focus: String(row.focus),
    status: String(row.status) as TradingWorkerStatus, modelId: String(row.model_id), policyVersion: String(row.policy_version),
    workload: Number(row.workload), heartbeatAt: ms(row.heartbeat_at), lastTaskId: row.last_task_id == null ? null : String(row.last_task_id),
    completedTasks: Number(row.completed_tasks), failedTasks: Number(row.failed_tasks), totalLatencyMs: Number(row.total_latency_ms),
    totalTokens: Number(row.total_tokens), lastError: row.last_error == null ? null : String(row.last_error),
  };
}

export class SqlTradingWorkerRegistry implements TradingWorkerRegistry {
  private sqlPromise: Promise<SqlLike> | null = null;
  private sql(): Promise<SqlLike> {
    this.sqlPromise ??= import("../../lib/db.ts").then(({ getSql }) => getSql());
    return this.sqlPromise;
  }

  async ensureSeeded(now = Date.now()): Promise<number> {
    const sql = await this.sql();
    const rows = await sql.query<{ count: string | number }>("select count(*) as count from trading_worker_registry");
    if (Number(rows[0]?.count ?? 0) === 1000) return 0;
    const workers = buildDeterministicTradingWorkerRegistry(now);
    let inserted = 0;
    for (const w of workers) {
      const result = await sql.query(
        `insert into trading_worker_registry
          (worker_id, registry_id, worker_number, specialization_id, specialization_name, family, markets, methods, capabilities, focus, status, model_id, policy_version, heartbeat_at)
         values ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9::jsonb,$10,$11,$12,$13,to_timestamp($14/1000.0))
         on conflict (worker_id) do nothing
         returning worker_id`,
        [w.workerId,w.registryId,w.workerNumber,w.specializationId,w.specializationName,w.family,JSON.stringify(w.markets),JSON.stringify(w.methods),JSON.stringify(w.capabilities),w.focus,w.status,w.modelId,w.policyVersion,now],
      );
      inserted += result.length;
    }
    const finalRows = await sql.query<{ count: string | number }>("select count(*) as count from trading_worker_registry");
    if (Number(finalRows[0]?.count ?? 0) !== 1000) throw new Error("trading_worker_registry_1000_invariant_failed");
    return inserted;
  }

  async list(query: WorkerRegistryQuery = {}): Promise<TradingWorkerIdentity[]> {
    const sql = await this.sql();
    const where: string[] = []; const params: unknown[] = [];
    if (query.family) { params.push(query.family); where.push(`family = $${params.length}`); }
    if (query.market) { params.push(query.market); where.push(`(markets @> $${params.length}::jsonb or markets @> '["all"]'::jsonb)`); }
    if (query.capability) { params.push(JSON.stringify([query.capability])); where.push(`capabilities @> $${params.length}::jsonb`); }
    if (query.availableOnly) where.push("status = 'available'");
    const rows = await sql.query<Record<string, unknown>>(
      `select * from trading_worker_registry ${where.length ? `where ${where.join(" and ")}` : ""} order by workload asc, worker_number asc`, params);
    return rows.map(fromRow);
  }

  async get(workerId: string) {
    const sql = await this.sql();
    const rows = await sql.query<Record<string, unknown>>("select * from trading_worker_registry where worker_id = $1", [workerId]);
    return rows[0] ? fromRow(rows[0]) : null;
  }

  async markBusy(workerId: string, taskId: string, now = Date.now()): Promise<boolean> {
    const sql = await this.sql();
    const rows = await sql.query(
      `update trading_worker_registry set status='busy', workload=1, last_task_id=$2, heartbeat_at=to_timestamp($3/1000.0), updated_at=current_timestamp where worker_id=$1 and status='available' and workload=0 returning worker_id`,
      [workerId, taskId, now],
    );
    return rows.length > 0;
  }

  async heartbeat(workerId: string, taskId: string, now = Date.now()): Promise<boolean> {
    const sql = await this.sql();
    const rows = await sql.query(
      `update trading_worker_registry set heartbeat_at=to_timestamp($3/1000.0), updated_at=current_timestamp where worker_id=$1 and last_task_id=$2 and status='busy' returning worker_id`,
      [workerId, taskId, now],
    );
    return rows.length > 0;
  }

  async recordResult(input: { workerId: string; taskId: string; ok: boolean; durationMs: number; tokens?: number; error?: string; now?: number }): Promise<boolean> {
    const sql = await this.sql();
    const rows = await sql.query(
      `update trading_worker_registry set completed_tasks=completed_tasks+$3, failed_tasks=failed_tasks+$4, total_latency_ms=total_latency_ms+$5, total_tokens=total_tokens+$6, last_error=$7, heartbeat_at=to_timestamp($8/1000.0), updated_at=current_timestamp where worker_id=$1 and last_task_id=$2 returning worker_id`,
      [input.workerId,input.taskId,input.ok ? 1 : 0,input.ok ? 0 : 1,Math.max(0,Math.round(input.durationMs)),Math.max(0,Math.round(input.tokens ?? 0)),input.ok ? null : (input.error ?? "worker_task_failed").slice(0,2000),input.now ?? Date.now()],
    );
    return rows.length > 0;
  }

  async release(workerId: string, taskId: string, now = Date.now()): Promise<boolean> {
    const sql = await this.sql();
    const rows = await sql.query(
      `update trading_worker_registry set status='available', workload=0, heartbeat_at=to_timestamp($3/1000.0), updated_at=current_timestamp where worker_id=$1 and last_task_id=$2 returning worker_id`,
      [workerId, taskId, now],
    );
    return rows.length > 0;
  }

  async recoverStale(now = Date.now(), staleMs = 30_000): Promise<number> {
    const sql = await this.sql();
    const cutoff = now - staleMs;
    const rows = await sql.query(
      `update trading_worker_registry set status='available', workload=0, heartbeat_at=to_timestamp($1/1000.0), last_error=coalesce(last_error, 'worker_lease_stale'), updated_at=current_timestamp where status='busy' and heartbeat_at is not null and heartbeat_at <= to_timestamp($2/1000.0) returning worker_id`,
      [now, cutoff],
    );
    return rows.length;
  }
}

import type { TradingEvent } from "./event-bus.ts";

export type TradingTaskStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "dead_letter";

export interface TradingTask<T = unknown> {
  id: string;
  type: string;
  payload: T;
  status: TradingTaskStatus;
  priority: number;
  availableAt: number;
  attempts: number;
  maxAttempts: number;
  workerId: string | null;
  leaseUntil: number | null;
  heartbeatAt: number | null;
  lastError: string | null;
  createdAt: number;
  updatedAt: number;
  completedAt: number | null;
}

export interface TaskRoutingHints {
  family?: string;
  market?: string;
  requiredCapability?: string;
  preferredWorkerId?: string;
}

export interface EnqueueTaskInput<T = unknown> {
  id: string;
  type: string;
  payload: T;
  routing?: TaskRoutingHints;
  priority?: number;
  availableAt?: number;
  maxAttempts?: number;
}

export interface ClaimOptions {
  workerId: string;
  taskId?: string;
  leaseMs?: number;
  now?: number;
}

export interface TaskQueue {
  enqueue<T>(input: EnqueueTaskInput<T>): Promise<{ inserted: boolean; task: TradingTask<T> }>;
  peek<T = unknown>(limit?: number, now?: number): Promise<TradingTask<T>[]>;
  claim<T = unknown>(options: ClaimOptions): Promise<TradingTask<T> | null>;
  heartbeat(taskId: string, workerId: string, now?: number, leaseMs?: number): Promise<boolean>;
  complete(taskId: string, workerId: string, now?: number): Promise<boolean>;
  fail(taskId: string, workerId: string, error: string, options?: { now?: number; retryDelayMs?: number }): Promise<TradingTask | null>;
  recoverExpiredLeases(now?: number): Promise<number>;
  getById<T = unknown>(taskId: string): Promise<TradingTask<T> | null>;
}

function normalizeTask<T>(task: TradingTask<T>): TradingTask<T> {
  return structuredClone(task);
}

function validateTaskInput(input: EnqueueTaskInput): void {
  if (!input.id.trim()) throw new Error("task_id_required");
  if (!input.type.trim()) throw new Error("task_type_required");
  const maxAttempts = input.maxAttempts ?? 5;
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 100) {
    throw new Error("invalid_max_attempts");
  }
}

export class InMemoryTaskQueue implements TaskQueue {
  private readonly tasks = new Map<string, TradingTask>();

  async enqueue<T>(input: EnqueueTaskInput<T>) {
    validateTaskInput(input);
    const existing = this.tasks.get(input.id);
    if (existing) return { inserted: false, task: normalizeTask(existing) as TradingTask<T> };
    const now = Date.now();
    const task: TradingTask<T> = {
      id: input.id,
      type: input.type,
      // When routing hints are supplied, the stored payload is wrapped as
      // `{ data, _routing }` (consumers unwrap this — see
      // worker-execution.ts/worker-supervisor.ts) rather than being a bare
      // `T`. The cast documents that intentional envelope instead of
      // silently lying to callers that never pass routing hints.
      payload: structuredClone(
        input.routing ? { data: input.payload, _routing: input.routing } : input.payload,
      ) as T,
      status: "queued",
      priority: input.priority ?? 0,
      availableAt: input.availableAt ?? now,
      attempts: 0,
      maxAttempts: input.maxAttempts ?? 5,
      workerId: null,
      leaseUntil: null,
      heartbeatAt: null,
      lastError: null,
      createdAt: now,
      updatedAt: now,
      completedAt: null,
    };
    this.tasks.set(task.id, task);
    return { inserted: true, task: normalizeTask(task) };
  }

  async peek<T = unknown>(limit = 16, now = Date.now()) {
    return [...this.tasks.values()]
      .filter((task) => task.status === "queued" && task.availableAt <= now)
      .sort((a, b) => b.priority - a.priority || a.createdAt - b.createdAt || a.id.localeCompare(b.id))
      .slice(0, Math.max(1, Math.min(100, limit)))
      .map(normalizeTask) as TradingTask<T>[];
  }

  async claim<T = unknown>({ workerId, taskId, leaseMs = 15_000, now = Date.now() }: ClaimOptions) {
    if (!workerId.trim()) throw new Error("worker_id_required");
    if (!Number.isFinite(leaseMs) || leaseMs < 1000 || leaseMs > 300_000) throw new Error("invalid_lease_ms");
    await this.recoverExpiredLeases(now);
    const candidates = [...this.tasks.values()]
      .filter((task) => task.status === "queued" && task.availableAt <= now)
      .sort((a, b) => b.priority - a.priority || a.createdAt - b.createdAt || a.id.localeCompare(b.id));
    const task = taskId ? candidates.find((candidate) => candidate.id === taskId) : candidates[0];
    if (!task) return null;
    task.status = "running";
    task.workerId = workerId;
    task.attempts += 1;
    task.leaseUntil = now + leaseMs;
    task.heartbeatAt = now;
    task.updatedAt = now;
    return normalizeTask(task) as TradingTask<T>;
  }

  async heartbeat(taskId: string, workerId: string, now = Date.now(), leaseMs = 15_000): Promise<boolean> {
    const task = this.tasks.get(taskId);
    if (!task || task.status !== "running" || task.workerId !== workerId) return false;
    task.heartbeatAt = now;
    task.leaseUntil = now + leaseMs;
    task.updatedAt = now;
    return true;
  }

  async complete(taskId: string, workerId: string, now = Date.now()): Promise<boolean> {
    const task = this.tasks.get(taskId);
    if (!task || task.status !== "running" || task.workerId !== workerId) return false;
    task.status = "completed";
    task.completedAt = now;
    task.leaseUntil = null;
    task.heartbeatAt = now;
    task.updatedAt = now;
    return true;
  }

  async fail(taskId: string, workerId: string, error: string, options: { now?: number; retryDelayMs?: number } = {}) {
    const now = options.now ?? Date.now();
    const task = this.tasks.get(taskId);
    if (!task || task.status !== "running" || task.workerId !== workerId) return null;
    task.lastError = error.slice(0, 2_000);
    task.workerId = null;
    task.leaseUntil = null;
    task.heartbeatAt = now;
    task.updatedAt = now;
    if (task.attempts >= task.maxAttempts) {
      task.status = "dead_letter";
      return normalizeTask(task);
    }
    task.status = "queued";
    task.availableAt = now + Math.max(0, options.retryDelayMs ?? 0);
    return normalizeTask(task);
  }

  async recoverExpiredLeases(now = Date.now()): Promise<number> {
    let recovered = 0;
    for (const task of this.tasks.values()) {
      if (task.status === "running" && task.leaseUntil !== null && task.leaseUntil <= now) {
        task.status = task.attempts >= task.maxAttempts ? "dead_letter" : "queued";
        task.workerId = null;
        task.leaseUntil = null;
        task.updatedAt = now;
        task.lastError ??= "lease_expired";
        if (task.status === "queued") task.availableAt = now;
        recovered += 1;
      }
    }
    return recovered;
  }

  async getById<T = unknown>(taskId: string): Promise<TradingTask<T> | null> {
    const task = this.tasks.get(taskId);
    return task ? normalizeTask(task) as TradingTask<T> : null;
  }
}

interface SqlLike {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
}

function fromRow<T>(row: Record<string, unknown>): TradingTask<T> {
  const toMs = (value: unknown): number | null => value == null ? null : new Date(String(value)).getTime();
  const payload = typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload;
  return {
    id: String(row.task_id),
    type: String(row.task_type),
    payload: payload as T,
    status: String(row.status) as TradingTaskStatus,
    priority: Number(row.priority),
    availableAt: toMs(row.available_at) ?? 0,
    attempts: Number(row.attempt_count),
    maxAttempts: Number(row.max_attempts),
    workerId: row.worker_id == null ? null : String(row.worker_id),
    leaseUntil: toMs(row.lease_until),
    heartbeatAt: toMs(row.heartbeat_at),
    lastError: row.last_error == null ? null : String(row.last_error),
    createdAt: toMs(row.created_at) ?? 0,
    updatedAt: toMs(row.updated_at) ?? 0,
    completedAt: toMs(row.completed_at),
  };
}

/** PostgreSQL/Neon queue implementation. Claim uses SKIP LOCKED for safe concurrency. */
export class SqlTaskQueue implements TaskQueue {
  private sqlPromise: Promise<SqlLike> | null = null;

  private sql(): Promise<SqlLike> {
    this.sqlPromise ??= import("../../lib/db.ts").then(({ getSql }) => getSql());
    return this.sqlPromise;
  }

  async enqueue<T>(input: EnqueueTaskInput<T>) {
    validateTaskInput(input);
    const sql = await this.sql();
    const rows = await sql.query<Record<string, unknown>>(
      `insert into trading_task_queue
        (task_id, task_type, payload, priority, available_at, max_attempts)
       values ($1, $2, $3::jsonb, $4, to_timestamp($5 / 1000.0), $6)
       on conflict (task_id) do nothing
       returning *`,
      [input.id, input.type, JSON.stringify(input.routing ? { data: input.payload, _routing: input.routing } : input.payload), input.priority ?? 0, input.availableAt ?? Date.now(), input.maxAttempts ?? 5],
    );
    if (rows[0]) return { inserted: true, task: fromRow<T>(rows[0]) };
    const existing = await this.getById<T>(input.id);
    if (!existing) throw new Error("task_insert_race_unresolved");
    return { inserted: false, task: existing };
  }

  async peek<T = unknown>(limit = 16, now = Date.now()) {
    const sql = await this.sql();
    const rows = await sql.query<Record<string, unknown>>(
      `select * from trading_task_queue
       where status = 'queued' and extract(epoch from available_at) * 1000 <= $1
       order by priority desc, created_at asc, task_id asc
       limit $2`,
      [now, Math.max(1, Math.min(100, limit))],
    );
    return rows.map((row) => fromRow<T>(row));
  }

  async claim<T = unknown>({ workerId, taskId, leaseMs = 15_000, now = Date.now() }: ClaimOptions) {
    if (!workerId.trim()) throw new Error("worker_id_required");
    if (!Number.isFinite(leaseMs) || leaseMs < 1000 || leaseMs > 300_000) throw new Error("invalid_lease_ms");
    await this.recoverExpiredLeases(now);
    const sql = await this.sql();
    const rows = await sql.query<Record<string, unknown>>(
      `update trading_task_queue
       set status = 'running',
           worker_id = $1,
           attempt_count = attempt_count + 1,
           lease_until = to_timestamp($2 / 1000.0) + make_interval(secs => $3 / 1000.0),
           heartbeat_at = to_timestamp($2 / 1000.0),
           updated_at = current_timestamp
       where task_id = (
         select task_id
         from trading_task_queue
         where status = 'queued' and extract(epoch from available_at) * 1000 <= $2
           and ($4::text is null or task_id = $4)
         order by priority desc, created_at asc, task_id asc
         for update skip locked
         limit 1
       )
       returning *`,
      [workerId, now, leaseMs, taskId ?? null],
    );
    return rows[0] ? fromRow<T>(rows[0]) : null;
  }

  async heartbeat(taskId: string, workerId: string, now = Date.now(), leaseMs = 15_000): Promise<boolean> {
    const sql = await this.sql();
    const rows = await sql.query(
      `update trading_task_queue
       set heartbeat_at = to_timestamp($3 / 1000.0),
           lease_until = to_timestamp($3 / 1000.0) + make_interval(secs => $4 / 1000.0),
           updated_at = current_timestamp
       where task_id = $1 and worker_id = $2 and status = 'running'
       returning task_id`,
      [taskId, workerId, now, leaseMs],
    );
    return rows.length > 0;
  }

  async complete(taskId: string, workerId: string, now = Date.now()): Promise<boolean> {
    const sql = await this.sql();
    const rows = await sql.query(
      `update trading_task_queue
       set status = 'completed', completed_at = to_timestamp($3 / 1000.0),
           lease_until = null, heartbeat_at = to_timestamp($3 / 1000.0), updated_at = current_timestamp
       where task_id = $1 and worker_id = $2 and status = 'running'
       returning task_id`,
      [taskId, workerId, now],
    );
    return rows.length > 0;
  }

  async fail(taskId: string, workerId: string, error: string, options: { now?: number; retryDelayMs?: number } = {}) {
    const now = options.now ?? Date.now();
    const delay = Math.max(0, options.retryDelayMs ?? 0);
    const sql = await this.sql();
    const rows = await sql.query<Record<string, unknown>>(
      `update trading_task_queue
       set status = case when attempt_count >= max_attempts then 'dead_letter' else 'queued' end,
           worker_id = null, lease_until = null,
           heartbeat_at = to_timestamp($3 / 1000.0),
           available_at = to_timestamp(($3 + $4) / 1000.0),
           last_error = left($5, 2000), updated_at = current_timestamp
       where task_id = $1 and worker_id = $2 and status = 'running'
       returning *`,
      [taskId, workerId, now, delay, error],
    );
    return rows[0] ? fromRow(rows[0]) : null;
  }

  async recoverExpiredLeases(now = Date.now()): Promise<number> {
    const sql = await this.sql();
    const rows = await sql.query<Record<string, unknown>>(
      `update trading_task_queue
       set status = case when attempt_count >= max_attempts then 'dead_letter' else 'queued' end,
           worker_id = null, lease_until = null,
           available_at = case when attempt_count >= max_attempts then available_at else to_timestamp($1 / 1000.0) end,
           last_error = coalesce(last_error, 'lease_expired'),
           updated_at = current_timestamp
       where status = 'running' and lease_until is not null and lease_until <= to_timestamp($1 / 1000.0)
       returning task_id`,
      [now],
    );
    return rows.length;
  }

  async getById<T = unknown>(taskId: string) {
    const sql = await this.sql();
    const rows = await sql.query<Record<string, unknown>>(
      `select * from trading_task_queue where task_id = $1 limit 1`,
      [taskId],
    );
    return rows[0] ? fromRow<T>(rows[0]) : null;
  }
}

export function inferTradingEventRouting(event: TradingEvent): TaskRoutingHints {
  const payload = (event.payload ?? {}) as Record<string, unknown>;
  const tick = (payload.tick ?? payload.marketTick ?? payload) as Record<string, unknown>;
  const market = typeof tick.market === "string" ? tick.market : undefined;
  if (event.type.startsWith("market.")) return { market, requiredCapability: "market-data" };
  if (event.type.startsWith("news.")) return { market, family: "News", requiredCapability: "news" };
  if (event.type.startsWith("macro.")) return { market, family: "Macro" };
  if (event.type.startsWith("risk.")) return { market, family: "Risk", requiredCapability: "risk" };
  if (event.type.startsWith("strategy.")) return { market, family: "Strategy", requiredCapability: "strategy" };
  return { market };
}

const WORKER_EVENT_TASK_TYPES = new Set([
  "news.market-moving",
  "news.event",
  "macro.release",
  "macro.event",
  "risk.alert",
  "strategy.signal",
  "strategy.review",
  "market.regime.changed",
  "paper.order.filled",
]);

export function taskFromTradingEvent(event: TradingEvent, options: { id?: string; priority?: number; maxAttempts?: number; routing?: TaskRoutingHints } = {}): EnqueueTaskInput {
  const inferred = inferTradingEventRouting(event);
  const routing = { ...inferred, ...(options.routing ?? {}) };
  const type = WORKER_EVENT_TASK_TYPES.has(event.type) ? "event.analyze" : `event:${event.type}`;
  return {
    id: options.id ?? `task:${event.id}`,
    type,
    payload: event,
    routing,
    priority: options.priority ?? 0,
    maxAttempts: options.maxAttempts ?? 5,
  };
}

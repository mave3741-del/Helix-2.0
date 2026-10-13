import type { TradingTask, TaskQueue } from "./task-queue.ts";
import { stableHash, InMemoryTaskResultStore, SqlTaskResultStore, type TaskResultStore, type TradingTaskResult, type TradingTaskProvenance } from "./task-results.ts";
import { InMemoryTradingWorkerRegistry, SqlTradingWorkerRegistry, type TradingWorkerIdentity, type TradingWorkerRegistry, type WorkerRegistryQuery } from "./worker-registry.ts";

export interface WorkerExecutionContext<T = unknown> {
  task: TradingTask<T>;
  worker: TradingWorkerIdentity;
}

export interface WorkerExecutionResult<T = unknown> {
  ok: boolean;
  output: T;
  tokens?: number;
  executor?: string;
  error?: string;
}

export type WorkerExecutor = <T>(context: WorkerExecutionContext<T>) => Promise<WorkerExecutionResult>;

export interface WorkerSupervisorOptions {
  concurrency?: number;
  leaseMs?: number;
  heartbeatMs?: number;
  workerStaleMs?: number;
  defaultQuery?: WorkerRegistryQuery;
}

export interface SupervisorRunStats {
  claimed: number;
  completed: number;
  failed: number;
  retried: number;
  deadLettered: number;
}

export function chooseWorker(workers: TradingWorkerIdentity[], task: TradingTask): TradingWorkerIdentity | null {
  const raw = (task.payload ?? {}) as { market?: string; requiredCapability?: string; family?: string; preferredWorkerId?: string; _routing?: { market?: string; requiredCapability?: string; family?: string; preferredWorkerId?: string } };
  const payload = { ...raw, ...(raw._routing ?? {}) };
  const ranked = workers
    .filter((w) => w.status === "available" && w.workload === 0)
    .map((w) => {
      let score = 0;
      if (payload.preferredWorkerId === w.workerId) score += 10000;
      if (payload.family && w.family === payload.family) score += 500;
      if (payload.market && (w.markets.includes(payload.market) || w.markets.includes("all"))) score += 250;
      if (payload.requiredCapability && w.capabilities.includes(payload.requiredCapability)) score += 300;
      return { w, score };
    })
    .sort((a,b) => b.score - a.score || a.w.workload - b.w.workload || a.w.workerNumber - b.w.workerNumber);
  return ranked[0]?.w ?? null;
}

export class TradingWorkerSupervisor {
  private readonly queue: TaskQueue;
  private readonly registry: TradingWorkerRegistry;
  private readonly results: TaskResultStore;
  private readonly executor: WorkerExecutor;
  private readonly concurrency: number;
  private readonly leaseMs: number;
  private readonly heartbeatMs: number;
  private readonly defaultQuery?: WorkerRegistryQuery;
  private readonly workerStaleMs: number;
  private readonly reservations = new Set<string>();
  private running = 0;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private started = false;
  private stopping = false;

  constructor(input: { queue: TaskQueue; registry?: TradingWorkerRegistry; results?: TaskResultStore; executor: WorkerExecutor; options?: WorkerSupervisorOptions }) {
    this.queue = input.queue;
    this.registry = input.registry ?? new SqlTradingWorkerRegistry();
    this.results = input.results ?? new SqlTaskResultStore();
    this.executor = input.executor;
    this.concurrency = Math.max(1, Math.min(1000, Math.floor(input.options?.concurrency ?? 32)));
    this.leaseMs = input.options?.leaseMs ?? 15_000;
    this.heartbeatMs = Math.max(500, Math.min(this.leaseMs - 250, input.options?.heartbeatMs ?? Math.floor(this.leaseMs / 3)));
    this.defaultQuery = input.options?.defaultQuery;
    this.workerStaleMs = input.options?.workerStaleMs ?? this.leaseMs * 2;
  }

  async bootstrap(now = Date.now()): Promise<number> {
    const seeded = await this.registry.ensureSeeded(now);
    await this.queue.recoverExpiredLeases(now);
    await this.registry.recoverStale(now, this.workerStaleMs);
    return seeded;
  }
  capacity(): number { return this.concurrency - this.running; }
  isStarted(): boolean { return this.started && !this.stopping; }

  start(pollMs = 250): void {
    if (this.isStarted()) return;
    this.stopping = false;
    this.started = true;
    const loop = async () => {
      if (this.stopping) return;
      try { await this.runOnce(); } catch {
        // Supervisor errors are isolated to the poll cycle; the durable queue remains authoritative.
      } finally {
        if (!this.stopping) this.pollTimer = setTimeout(() => { void loop(); }, Math.max(25, pollMs));
      }
    };
    void loop();
  }

  async stop(): Promise<void> {
    this.stopping = true;
    this.started = false;
    if (this.pollTimer) clearTimeout(this.pollTimer);
    this.pollTimer = null;
    while (this.running > 0) await new Promise((resolve) => setTimeout(resolve, 10));
  }

  async runOnce(now = Date.now()): Promise<SupervisorRunStats> {
    await this.bootstrap(now);
    const stats: SupervisorRunStats = { claimed: 0, completed: 0, failed: 0, retried: 0, deadLettered: 0 };
    const slots = Math.max(0, Math.min(this.capacity(), this.concurrency));
    if (!slots) return stats;

    const jobs = Array.from({ length: slots }, () => this.runSlot(now));
    const results = await Promise.all(jobs);
    for (const result of results) {
      stats.claimed += result.claimed ? 1 : 0;
      if (!result.claimed) continue;
      if (result.status === "completed") stats.completed += 1;
      if (result.status === "queued") { stats.failed += 1; stats.retried += 1; }
      if (result.status === "dead_letter") { stats.failed += 1; stats.deadLettered += 1; }
    }
    return stats;
  }

  private async runSlot(now: number): Promise<{ claimed: false } | { claimed: true; status: "completed" | "queued" | "dead_letter" }> {
    const tasks = await this.queue.peek(Math.max(32, this.concurrency * 2), now);
    if (!tasks.length) return { claimed: false };
    const workers = (await this.registry.list({ ...this.optionsQuery(), availableOnly: true })).filter((worker) => !this.reservations.has(worker.workerId));

    for (const task of tasks) {
      const worker = chooseWorker(workers, task);
      if (!worker || this.reservations.has(worker.workerId)) continue;
      this.reservations.add(worker.workerId);
      const claimed = await this.queue.claim({ workerId: worker.workerId, taskId: task.id, leaseMs: this.leaseMs, now });
      if (!claimed) { this.reservations.delete(worker.workerId); continue; }
      if (!(await this.registry.markBusy(worker.workerId, task.id, now))) {
        const failed = await this.queue.fail(task.id, worker.workerId, "worker_registry_busy", { now, retryDelayMs: 250 });
        this.reservations.delete(worker.workerId);
        return { claimed: true, status: failed?.status === "dead_letter" ? "dead_letter" : "queued" };
      }
      this.reservations.delete(worker.workerId);
      this.running += 1;
      try {
        const result = await this.executeClaimed(claimed, worker);
        return { claimed: true, status: result.retryStatus };
      } finally {
        this.running -= 1;
      }
    }
    return { claimed: false };
  }

  private optionsQuery(): WorkerRegistryQuery { return this.defaultQuery ?? {}; }

  private async executeClaimed(task: TradingTask, worker: TradingWorkerIdentity): Promise<{ ok: boolean; retryStatus: "completed" | "queued" | "dead_letter" }> {
    const startedAt = Date.now();
    let heartbeat: ReturnType<typeof setInterval> | null = null;
    heartbeat = setInterval(() => {
      void Promise.all([
        this.queue.heartbeat(task.id, worker.workerId, Date.now(), this.leaseMs),
        this.registry.heartbeat(worker.workerId, task.id, Date.now()),
      ]);
    }, this.heartbeatMs);
    try {
      const execution = await this.executor({ task, worker });
      const completedAt = Date.now();
      const inputHash = await stableHash({ id: task.id, type: task.type, payload: task.payload });
      const outputHash = await stableHash(execution.output);
      const provenance: TradingTaskProvenance = {
        taskId: task.id, workerId: worker.workerId, registryId: worker.registryId, attempt: task.attempts,
        taskType: task.type, inputHash, outputHash, startedAt, completedAt, executor: execution.executor ?? "custom",
      };
      const provenanceHash = await stableHash(provenance);
      const record: TradingTaskResult = {
        resultId: `result:${task.id}:${task.attempts}`, taskId: task.id, workerId: worker.workerId, attempt: task.attempts,
        ok: execution.ok, startedAt, completedAt, durationMs: Math.max(0, completedAt - startedAt), output: execution.output,
        provenance, provenanceHash,
      };
      await this.results.record(record);
      await this.registry.recordResult({ workerId: worker.workerId, taskId: task.id, ok: execution.ok, durationMs: record.durationMs, tokens: execution.tokens, error: execution.error, now: completedAt });
      if (execution.ok) {
        await this.queue.complete(task.id, worker.workerId, completedAt);
        return { ok: true, retryStatus: "completed" };
      }
      const failed = await this.queue.fail(task.id, worker.workerId, execution.error ?? "worker_execution_failed", { now: completedAt, retryDelayMs: Math.min(60_000, 1000 * 2 ** Math.max(0, task.attempts - 1)) });
      return { ok: false, retryStatus: failed?.status === "dead_letter" ? "dead_letter" : "queued" };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const completedAt = Date.now();
      await this.registry.recordResult({ workerId: worker.workerId, taskId: task.id, ok: false, durationMs: completedAt - startedAt, error: message, now: completedAt });
      const failed = await this.queue.fail(task.id, worker.workerId, message, { now: completedAt, retryDelayMs: 1000 });
      return { ok: false, retryStatus: failed?.status === "dead_letter" ? "dead_letter" : "queued" };
    } finally {
      if (heartbeat) clearInterval(heartbeat);
      await this.registry.release(worker.workerId, task.id, Date.now());
    }
  }
}

export function createInMemorySupervisor(input: { queue: TaskQueue; executor: WorkerExecutor; concurrency?: number }) {
  return new TradingWorkerSupervisor({
    queue: input.queue,
    executor: input.executor,
    registry: new InMemoryTradingWorkerRegistry(),
    results: new InMemoryTaskResultStore(),
    options: { concurrency: input.concurrency ?? 8 },
  });
}

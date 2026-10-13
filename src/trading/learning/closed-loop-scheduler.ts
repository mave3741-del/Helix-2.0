import type { PaperTradeAttribution } from '../post-trade.ts';
import { runClosedLoopCycle, type ClosedLoopCycleResult, type ClosedLoopPolicy, type ClosedLoopStore, type StrategyCycleState, type StrategyLearningProfile } from './closed-loop.ts';
import { evaluateCycleHealth, type CycleHealthInput, type CycleHealthResult } from '../ops/cycle-health.ts';

export interface CycleHealthStore { save(result: CycleHealthResult): Promise<void>; latest(): Promise<CycleHealthResult | null>; }

export class InMemoryCycleHealthStore implements CycleHealthStore {
  private latestResult: CycleHealthResult | null = null;
  async save(result: CycleHealthResult): Promise<void> { this.latestResult = structuredClone(result); }
  async latest(): Promise<CycleHealthResult | null> { return this.latestResult ? structuredClone(this.latestResult) : null; }
}

export class SqlCycleHealthStore implements CycleHealthStore {
  private sqlPromise: Promise<{ query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]> }> | null = null;
  private sql() { this.sqlPromise ??= import('../../lib/db.ts').then(({ getSql }) => getSql()); return this.sqlPromise; }
  async save(result: CycleHealthResult): Promise<void> {
    const sql = await this.sql();
    await sql.query(`insert into trading_cycle_health_audits (cycle_id, status, score, reasons, decision_hash) values ($1,$2,$3,$4::jsonb,$5) on conflict (cycle_id) do nothing`, [result.cycleId, result.status, result.score, JSON.stringify(result.reasons), result.decisionHash]);
  }
  async latest(): Promise<CycleHealthResult | null> {
    const sql = await this.sql();
    const rows = await sql.query<Record<string, unknown>>(`select cycle_id, status, score, reasons, decision_hash from trading_cycle_health_audits order by as_of_ts desc limit 1`);
    const row = rows[0]; if (!row) return null;
    const reasons = typeof row.reasons === 'string' ? JSON.parse(row.reasons) as string[] : (row.reasons as string[]);
    return { cycleId:String(row.cycle_id), status:row.status as CycleHealthResult['status'], score:Number(row.score), reasons, decisionHash:String(row.decision_hash) };
  }
}

export interface ClosedLoopCycleProvider {
  collectTrades(): PaperTradeAttribution[];
  collectProfiles(): StrategyLearningProfile[];
  collectRealizedReturns?(): Record<string, number>;
  collectRealizedRisk?(): Record<string, number>;
  collectPriorState?(): StrategyCycleState[];
  collectCycleHealth?(): Omit<CycleHealthInput, 'cycleId'>;
}

export interface ClosedLoopSchedulerOptions {
  intervalMs: number;
  cycleIdPrefix?: string;
  startImmediately?: boolean;
  persistEveryCycle?: boolean;
  healthStore?: CycleHealthStore;
  onCycleHealth?: (result: CycleHealthResult) => void | Promise<void>;
}

export class ClosedLoopScheduler {
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private cycleNumber = 0;
  private readonly provider: ClosedLoopCycleProvider;
  private readonly store: ClosedLoopStore;
  private readonly policy: ClosedLoopPolicy;
  private readonly options: ClosedLoopSchedulerOptions;

  constructor(provider: ClosedLoopCycleProvider, store: ClosedLoopStore, policy: ClosedLoopPolicy, options: ClosedLoopSchedulerOptions) {
    this.provider = provider;
    this.store = store;
    this.policy = policy;
    this.options = options;
    if (!Number.isFinite(options.intervalMs) || options.intervalMs < 1000) throw new Error('invalid_closed_loop_interval');
  }

  async runOnce(asOfTs = Date.now()): Promise<ClosedLoopCycleResult> {
    if (this.running) throw new Error('closed_loop_cycle_already_running');
    this.running = true;
    try {
      this.cycleNumber += 1;
      const cycleId = `${this.options.cycleIdPrefix ?? 'closed-loop'}:${asOfTs}:${this.cycleNumber}`;
      const result = await runClosedLoopCycle({
        cycleId,
        asOfTs,
        trades: this.provider.collectTrades(),
        profiles: this.provider.collectProfiles(),
        realizedReturns: this.provider.collectRealizedReturns?.() ?? {},
        realizedRisk: this.provider.collectRealizedRisk?.() ?? {},
        priorState: this.provider.collectPriorState?.() ?? [],
      }, this.policy);
      if (this.options.persistEveryCycle !== false) await this.store.save(result);
      if (this.options.healthStore) {
        const authoritativeContext = this.provider.collectCycleHealth?.();
        const health = evaluateCycleHealth({
          cycleId,
          ...(authoritativeContext ?? {
            marketCount: 0,
            freshQuoteRatio: 0,
            quorumAgreementRatio: 0,
            governanceStatus: 'fail_closed' as const,
            closedLoopFailClosed: result.failClosed,
            paperFillCount: result.snapshots.reduce((sum, s) => sum + s.tradeCount, 0),
            paperNetPnl: result.snapshots.reduce((sum, s) => sum + s.netPnl, 0),
            watchdogStatus: 'halted' as const,
            reconciliationHash: null,
            authoritativeContextPresent: false,
          }),
        });
        await this.options.healthStore.save(health);
        await this.options.onCycleHealth?.(health);
        if (health.status === 'halted') this.stop();
      }
      return result;
    } finally {
      this.running = false;
    }
  }

  start(): void {
    if (this.timer) return;
    const tick = () => { void this.runOnce().catch(() => undefined); };
    if (this.options.startImmediately) tick();
    this.timer = setInterval(tick, this.options.intervalMs);
  }

  stop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  isRunning(): boolean { return Boolean(this.timer); }
  isCycleRunning(): boolean { return this.running; }
}

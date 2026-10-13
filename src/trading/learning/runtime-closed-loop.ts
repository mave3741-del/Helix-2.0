import type { RiskLimits } from '../../runtime/tools/trading.ts';
import type { ClosedLoopPolicy, ClosedLoopStore, StrategyLearningProfile } from './closed-loop.ts';
import { InMemoryClosedLoopStore, SqlClosedLoopStore } from './closed-loop.ts';
import { ClosedLoopScheduler, InMemoryCycleHealthStore, SqlCycleHealthStore } from './closed-loop-scheduler.ts';
import type { ServerTradingRuntime } from '../runtime/runtime.ts';
import type { OperationalHealthCoordinator } from '../ops/operational-health-coordinator.ts';

export interface RuntimeClosedLoopOptions {
  policy: ClosedLoopPolicy;
  profiles: StrategyLearningProfile[];
  intervalMs: number;
  store?: ClosedLoopStore;
  healthStore?: InMemoryCycleHealthStore | SqlCycleHealthStore;
  healthCoordinator?: OperationalHealthCoordinator;
}

export class RuntimeClosedLoopService {
  readonly scheduler: ClosedLoopScheduler;
  private readonly runtime: ServerTradingRuntime;
  constructor(runtime: ServerTradingRuntime, options: RuntimeClosedLoopOptions) {
    this.runtime = runtime;
    const store = options.store ?? new SqlClosedLoopStore();
    this.scheduler = new ClosedLoopScheduler({
      collectTrades: () => runtime.postTrade.trades(),
      collectProfiles: () => structuredClone(options.profiles),
      collectRealizedReturns: () => Object.fromEntries(options.profiles.map((p) => [p.strategyId, runtime.postTrade.trades(p.strategyId).reduce((s, t) => s + t.netPnl, 0)])),
      collectRealizedRisk: () => Object.fromEntries(options.profiles.map((p) => [p.strategyId, runtime.postTrade.trades(p.strategyId).reduce((s, t) => s + Math.max(0, -t.netPnl), 0)])),
      collectCycleHealth: () => {
        const context = options.healthCoordinator?.context({ paperFillCount: runtime.paper.listFills().length, paperNetPnl: runtime.paper.snapshot().realizedPnl }) ?? runtime.cycleHealthContext() ?? {
          marketCount: 0,
          freshQuoteRatio: 0,
          quorumAgreementRatio: 0,
          governanceStatus: 'fail_closed' as const,
          closedLoopFailClosed: false,
          paperFillCount: runtime.paper.listFills().length,
          paperNetPnl: runtime.paper.snapshot().realizedPnl,
          watchdogStatus: 'halted' as const,
          reconciliationHash: null,
        };
        runtime.setCycleHealthContext(context);
        return context;
      },
    }, store, options.policy, { intervalMs: options.intervalMs, cycleIdPrefix: `${runtime.runtimeId}:closed-loop`, startImmediately: false, persistEveryCycle: true, healthStore: options.healthStore ?? new SqlCycleHealthStore(), onCycleHealth: (health) => { runtime.setCycleHealth(health); options.healthCoordinator?.reset(); } });
  }
  start(): void { this.scheduler.start(); }
  stop(): void { this.scheduler.stop(); }
  isRunning(): boolean { return this.scheduler.isRunning(); }
}

export function createRuntimeClosedLoopService(runtime: ServerTradingRuntime, options: RuntimeClosedLoopOptions): RuntimeClosedLoopService {
  if (runtime.snapshot().mode !== 'paper') throw new Error('closed_loop_requires_paper_runtime');
  if (!Number.isFinite(options.intervalMs) || options.intervalMs < 1000) throw new Error('invalid_closed_loop_interval');
  return new RuntimeClosedLoopService(runtime, options);
}

export type { RiskLimits };
export { InMemoryClosedLoopStore, SqlClosedLoopStore };

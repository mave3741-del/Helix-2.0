import type { MarketScanResult } from '../market-scanner.ts';
import type { QuorumResult } from '../data/data-quorum.ts';
import type { WatchdogDecision } from './watchdog.ts';
import type { ChampionPortfolioReconciliationResult } from '../champion-portfolio-reconciliation.ts';
import type { CycleHealthInput } from './cycle-health.ts';

export interface OperationalHealthCoordinator {
  observeScan(scan: MarketScanResult): void;
  observeQuorum(result: QuorumResult, observedSources?: number, observationKey?: string): void;
  observeWatchdog(result: WatchdogDecision): void;
  observeReconciliation(result: ChampionPortfolioReconciliationResult): void;
  markClosedLoopFailClosed(failClosed: boolean): void;
  context(runtime: { paperFillCount: number; paperNetPnl: number }): Omit<CycleHealthInput, 'cycleId'>;
  reset(): void;
}

function watchdogRank(status: WatchdogDecision['mode']): number {
  return status === 'halted' ? 2 : status === 'degraded' ? 1 : 0;
}

export class RuntimeOperationalHealthCoordinator implements OperationalHealthCoordinator {
  private marketCount = 0;
  private freshQuoteRatio = 0;
  private readonly quorumObservations = new Map<string, { accepted: number; observed: number }>();
  private watchdogStatus: WatchdogDecision['mode'] = 'halted';
  private watchdogObserved = false;
  private governanceStatus: 'reconciled' | 'fail_closed' = 'fail_closed';
  private reconciliationHash: string | null = null;
  private closedLoopFailClosed = false;

  observeScan(scan: MarketScanResult): void {
    this.marketCount = scan.universeSize;
    this.freshQuoteRatio = scan.universeSize > 0 ? Math.max(0, Math.min(1, scan.validMarkets / scan.universeSize)) : 0;
  }

  observeQuorum(result: QuorumResult, observedSources = result.acceptedSources.length + result.rejectedSources.length, observationKey?: string): void {
    const total = Math.max(1, Math.floor(observedSources));
    const key = observationKey?.trim() || `observation:${this.quorumObservations.size}`;
    if (this.quorumObservations.has(key)) return;
    const uniqueAccepted = new Set(result.acceptedSources).size;
    const uniqueRejected = new Set(result.rejectedSources.map((x) => x.sourceId)).size;
    const uniqueObserved = Math.max(uniqueAccepted + uniqueRejected, Math.min(total, uniqueAccepted + uniqueRejected));
    this.quorumObservations.set(key, { accepted: Math.min(uniqueAccepted, uniqueObserved), observed: Math.max(1, uniqueObserved) });
  }

  observeWatchdog(result: WatchdogDecision): void {
    if (!this.watchdogObserved || watchdogRank(result.mode) > watchdogRank(this.watchdogStatus)) this.watchdogStatus = result.mode;
    this.watchdogObserved = true;
  }

  observeReconciliation(result: ChampionPortfolioReconciliationResult): void {
    this.governanceStatus = result.status;
    this.reconciliationHash = result.decisionHash;
  }

  markClosedLoopFailClosed(failClosed: boolean): void {
    this.closedLoopFailClosed = failClosed;
  }

  context(runtime: { paperFillCount: number; paperNetPnl: number }): Omit<CycleHealthInput, 'cycleId'> {
    return {
      marketCount: this.marketCount,
      freshQuoteRatio: this.freshQuoteRatio,
      quorumAgreementRatio: [...this.quorumObservations.values()].reduce((sum, item) => sum + item.accepted, 0) / Math.max(1, [...this.quorumObservations.values()].reduce((sum, item) => sum + item.observed, 0)),
      governanceStatus: this.governanceStatus,
      closedLoopFailClosed: this.closedLoopFailClosed,
      paperFillCount: runtime.paperFillCount,
      paperNetPnl: runtime.paperNetPnl,
      watchdogStatus: this.watchdogStatus,
      reconciliationHash: this.reconciliationHash,
    };
  }

  reset(): void {
    this.marketCount = 0;
    this.freshQuoteRatio = 0;
    this.quorumObservations.clear();
    this.watchdogStatus = 'halted';
    this.watchdogObserved = false;
    this.governanceStatus = 'fail_closed';
    this.reconciliationHash = null;
    this.closedLoopFailClosed = false;
  }
}

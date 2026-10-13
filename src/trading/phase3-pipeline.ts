import type { MarketScanCandidate, MarketScanResult } from './market-scanner.ts';
import { resolveQuorum, type DataQuorumPolicy, type QuorumObservation, type QuorumResult } from './data/data-quorum.ts';
import type { BenchmarkAgent, BenchmarkScenario, BenchmarkScore } from './benchmark-suite.ts';
import { benchmarkAgent } from './benchmark-suite.ts';
import type { WatchdogDecision, WatchdogPolicy, WatchdogSnapshot } from './ops/watchdog.ts';
import { evaluateWatchdog } from './ops/watchdog.ts';
import { DecisionLedger, type AgentDecision } from './agents/decision-ledger.ts';
import type { OperationalHealthCoordinator } from './ops/operational-health-coordinator.ts';

export interface Phase3CandidateInput {
  scan: MarketScanResult;
  candidate: MarketScanCandidate;
  observations: QuorumObservation[];
  decision: Omit<AgentDecision, 'decisionId' | 'createdAt'> & { decisionId?: string };
  watchdogSnapshot: WatchdogSnapshot;
}

export interface Phase3CandidateAssessment {
  ok: boolean;
  candidate: string;
  quorum?: QuorumResult;
  watchdog: WatchdogDecision;
  decisionId?: string;
  reasons: string[];
}

export interface Phase3PipelineOptions {
  quorumPolicy: DataQuorumPolicy;
  watchdogPolicy: WatchdogPolicy;
  ledger?: DecisionLedger;
  benchmarkAgents?: BenchmarkAgent[];
  benchmarkScenarios?: BenchmarkScenario[];
  healthCoordinator?: OperationalHealthCoordinator;
}

export interface Phase3BenchmarkResult {
  scores: BenchmarkScore[];
  passed: boolean;
  reasons: string[];
}

export class Phase3TradingPipeline {
  private readonly options: Phase3PipelineOptions;
  constructor(options: Phase3PipelineOptions) { this.options = options; }

  async assessCandidate(input: Phase3CandidateInput, now = Date.now()): Promise<Phase3CandidateAssessment> {
    const reasons: string[] = [];
    this.options.healthCoordinator?.observeScan(input.scan);
    if (input.candidate.snapshotTs > input.scan.completedAt || input.candidate.snapshotTs > now) {
      reasons.push('future_candidate_snapshot');
      return { ok: false, candidate: `${input.candidate.venue}:${input.candidate.symbol}`, watchdog: evaluateWatchdog(input.watchdogSnapshot, this.options.watchdogPolicy), reasons };
    }
    const watchdog = evaluateWatchdog(input.watchdogSnapshot, this.options.watchdogPolicy);
    this.options.healthCoordinator?.observeWatchdog(watchdog);
    if (watchdog.mode === 'halted') reasons.push('watchdog_halted');
    let quorum: QuorumResult | undefined;
    if (!reasons.length) {
      try { quorum = resolveQuorum(input.observations, now, this.options.quorumPolicy); this.options.healthCoordinator?.observeQuorum(quorum, input.observations.length, `${input.scan.scanId}:${input.candidate.market}`); }
      catch (error) { reasons.push(error instanceof Error ? error.message : 'quorum_rejected'); }
    }
    let decisionId: string | undefined;
    if (!reasons.length && this.options.ledger) {
      const record: Omit<AgentDecision, 'createdAt'> = {
        ...input.decision,
        decisionId: input.decision.decisionId ?? `decision:${input.scan.scanId}:${input.candidate.venue}:${input.candidate.symbol}` ,
        market: input.candidate.market,
        evidenceIds: [...new Set(input.decision.evidenceIds)].sort(),
        confidence: Math.min(input.decision.confidence, quorum?.confidence ?? input.decision.confidence),
        action: input.decision.action,
      };
      // Ledger persistence is authoritative for decision identity; callers may await record() separately.
      await this.options.ledger.record(record);
      decisionId = record.decisionId;
    }
    return { ok: reasons.length === 0, candidate: `${input.candidate.venue}:${input.candidate.symbol}`, quorum, watchdog, decisionId, reasons };
  }

  benchmark(agents: BenchmarkAgent[] = this.options.benchmarkAgents ?? [], scenarios: BenchmarkScenario[] = this.options.benchmarkScenarios ?? []): Phase3BenchmarkResult {
    const scores: BenchmarkScore[] = agents.map((agent) => benchmarkAgent(agent, scenarios));
    const reasons = scores.filter((s) => s.robustness < 0.6).map((s) => `${s.agentId}:robustness_below_threshold`);
    return { scores, passed: reasons.length === 0 && scores.length > 0 && scenarios.length > 0, reasons };
  }
}

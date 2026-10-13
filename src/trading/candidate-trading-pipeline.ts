import type { MarketScanCandidate, MarketScanResult } from './market-scanner.ts';
import type { EvidenceStore, TradingEvidencePacket } from './evidence.ts';
import type { TradingWorkerRegistry } from './runtime/worker-registry.ts';
import type { TaskQueue } from './runtime/task-queue.ts';
import type { ServerTradingRuntime } from './runtime/runtime.ts';
import type { TaskResultStore } from './runtime/task-results.ts';
import { evaluateExecutionReadiness } from './execution-readiness.ts';
import { nativeRiskCheck, type RiskLimits } from '../runtime/tools/trading.ts';
import type { OperationalHealthCoordinator } from './ops/operational-health-coordinator.ts';

export type CandidatePipelineStage = 'scanned' | 'worker-queued' | 'evidence-gated' | 'risk-gated' | 'paper-submitted' | 'rejected';

export interface CandidatePipelineInput {
  scan: MarketScanResult;
  candidate: MarketScanCandidate;
  evidenceIds: string[];
  equity: number;
  risk: RiskLimits;
  currentPosition?: { qty: number; avgPrice: number } | null;
  exposures?: Array<{ symbol: string; notional: number; side: 'long' | 'short'; sector?: string; market?: string }>;
  correlationToPortfolio?: number;
  sector?: string;
  tick: { bid: number; ask: number; bidSize: number; askSize: number; receivedTs: number };
  strategyId?: string;
  regime?: string;
}

export interface CandidatePipelineResult {
  candidateKey: string;
  stage: CandidatePipelineStage;
  taskId: string;
  workerId: string | null;
  evidenceIds: string[];
  riskReasons: string[];
  paperFillId?: string;
  rejectionReason?: string;
}

function candidateKey(candidate: MarketScanCandidate): string { return `${candidate.venue}:${candidate.symbol}`; }

function validEvidence(packet: TradingEvidencePacket, asOfTs: number): boolean {
  if (!Number.isFinite(packet.eventTs) || packet.eventTs > asOfTs) return false;
  if (!Number.isFinite(packet.retrievedTs) || packet.retrievedTs > asOfTs) return false;
  if (packet.publishedTs != null && packet.publishedTs > asOfTs) return false;
  if (!packet.contentHash) return false;
  return (packet.quality?.score ?? 0) >= 0.5;
}

export class CandidateTradingPipeline {
  private readonly evidence: EvidenceStore;
  private readonly workers: TradingWorkerRegistry;
  private readonly queue: TaskQueue;
  private readonly runtime: ServerTradingRuntime;
  private readonly results?: TaskResultStore;
  private readonly healthCoordinator?: OperationalHealthCoordinator;

  constructor(evidence: EvidenceStore, workers: TradingWorkerRegistry, queue: TaskQueue, runtime: ServerTradingRuntime, results?: TaskResultStore, healthCoordinator?: OperationalHealthCoordinator) {
    this.evidence = evidence;
    this.workers = workers;
    this.queue = queue;
    this.runtime = runtime;
    this.results = results;
    this.healthCoordinator = healthCoordinator;
  }

  async prepare(input: CandidatePipelineInput, now = Date.now()): Promise<CandidatePipelineResult> {
    const key = candidateKey(input.candidate);
    this.healthCoordinator?.observeScan(input.scan);
    const taskId = `candidate-analysis:${input.scan.scanId}:${key}`;
    if (input.candidate.snapshotTs > input.scan.completedAt || input.candidate.snapshotTs > now) {
      return { candidateKey: key, stage: 'rejected', taskId, workerId: null, evidenceIds: [], riskReasons: ['future_candidate_snapshot'], rejectionReason: 'future_candidate_snapshot' };
    }
    if (!input.evidenceIds.length) {
      return { candidateKey: key, stage: 'rejected', taskId, workerId: null, evidenceIds: [], riskReasons: [], rejectionReason: 'evidence_required' };
    }
    const packets: TradingEvidencePacket[] = [];
    for (const id of [...new Set(input.evidenceIds)].sort()) {
      const packet = await this.evidence.get(id);
      if (packet && validEvidence(packet, input.scan.completedAt) && packet.subjectId.toUpperCase() === input.candidate.symbol.toUpperCase()) packets.push(packet);
    }
    if (!packets.length) {
      return { candidateKey: key, stage: 'rejected', taskId, workerId: null, evidenceIds: [], riskReasons: [], rejectionReason: 'no_valid_pit_evidence' };
    }
    const workers = await this.workers.list({ market: input.candidate.market, capability: 'research', availableOnly: true });
    const worker = workers[0] ?? (await this.workers.list({ market: input.candidate.market, capability: 'technical', availableOnly: true }))[0];
    if (!worker) return { candidateKey: key, stage: 'rejected', taskId, workerId: null, evidenceIds: packets.map((p) => p.evidenceId), riskReasons: [], rejectionReason: 'no_available_specialist' };
    await this.queue.enqueue({ id: taskId, type: 'evidence.review', payload: { scanId: input.scan.scanId, symbol: input.candidate.symbol, asOfTs: input.scan.completedAt, evidenceIds: packets.map((p) => p.evidenceId) }, routing: { preferredWorkerId: worker.workerId, market: input.candidate.market, requiredCapability: 'research' }, priority: Math.round(input.candidate.score * 1000), maxAttempts: 3 });
    return { candidateKey: key, stage: 'worker-queued', taskId, workerId: worker.workerId, evidenceIds: packets.map((p) => p.evidenceId), riskReasons: [] };
  }

  async paperSubmit(input: CandidatePipelineInput, prepared: CandidatePipelineResult, side: 'buy' | 'sell', qty: number, now = Date.now()): Promise<CandidatePipelineResult> {
    if (prepared.stage !== 'worker-queued' && prepared.stage !== 'evidence-gated' && prepared.stage !== 'risk-gated') throw new Error('candidate_pipeline_not_prepared');
    if (this.results) {
      const review = await this.results.get(prepared.taskId);
      if (!review || !review.ok || !review.output || typeof review.output !== 'object' || (review.output as Record<string, unknown>).approved !== true) {
        return { ...prepared, stage: 'rejected', rejectionReason: 'specialist_review_required' };
      }
      const reviewedEvidence = Array.isArray((review.output as Record<string, unknown>).evidenceIds) ? (review.output as Record<string, unknown>).evidenceIds as string[] : [];
      if (reviewedEvidence.length !== prepared.evidenceIds.length || reviewedEvidence.some((id) => !prepared.evidenceIds.includes(id))) {
        return { ...prepared, stage: 'rejected', rejectionReason: 'specialist_evidence_mismatch' };
      }
    }
    const packets: TradingEvidencePacket[] = [];
    for (const id of prepared.evidenceIds) { const p = await this.evidence.get(id); if (p && validEvidence(p, input.scan.completedAt)) packets.push(p); }
    if (packets.length !== prepared.evidenceIds.length) return { ...prepared, stage: 'rejected', rejectionReason: 'evidence_changed_or_expired' };
    const price = side === 'buy' ? input.tick.ask : input.tick.bid;
    const current = input.currentPosition;
    const position = current && current.qty !== 0 ? { symbol: input.candidate.symbol, side: current.qty > 0 ? 'buy' as const : 'sell' as const, qty: Math.abs(current.qty), entry: current.avgPrice, mark: price, leverage: 1 } : null;
    if (input.exposures || input.correlationToPortfolio != null) {
      const execution = evaluateExecutionReadiness({ equity: input.equity, exposures: input.exposures ?? [], symbol: input.candidate.symbol, orderNotional: Math.abs(qty * price), sector: input.sector, market: input.candidate.market, correlationToPortfolio: input.correlationToPortfolio });
      if (!execution.ok) return { ...prepared, stage: 'rejected', riskReasons: execution.reasons, rejectionReason: 'portfolio_veto' };
    }
    const gate = nativeRiskCheck({ side, qty, price, position, limits: input.risk, dailyPnl: 0, equity: input.equity, existingGrossExposureNotional: current ? Math.abs(current.qty) * current.avgPrice : 0, peakEquity: input.equity });
    if (!gate.ok) return { ...prepared, stage: 'rejected', riskReasons: gate.reasons, rejectionReason: 'risk_veto' };
    const fill = await this.runtime.paperOrder({ clientOrderId: `paper:${input.scan.scanId}:${input.candidate.venue}:${input.candidate.symbol}:${side}:${now}`, symbol: input.candidate.symbol, side, qty, tick: { symbol: input.candidate.symbol, venue: input.candidate.venue, market: input.candidate.market, bid: input.tick.bid, ask: input.tick.ask, last: (input.tick.bid + input.tick.ask) / 2, bidSize: input.tick.bidSize, askSize: input.tick.askSize, sequence: now, exchangeTs: input.candidate.snapshotTs, receivedTs: input.tick.receivedTs }, strategyId: input.strategyId, regime: input.regime, evidenceIds: prepared.evidenceIds });
    return { ...prepared, stage: 'paper-submitted', riskReasons: [], paperFillId: fill.fillId };
  }
}

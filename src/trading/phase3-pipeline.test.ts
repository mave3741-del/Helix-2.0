import test from 'node:test';
import assert from 'node:assert/strict';
import { Phase3TradingPipeline } from './phase3-pipeline.ts';
import { DecisionLedger } from './agents/decision-ledger.ts';
import type { MarketScanResult } from './market-scanner.ts';

const scan: MarketScanResult = {
  scanId: 'scan-1', cadence: 'normal', startedAt: 1000, completedAt: 2000, universeSize: 1, validMarkets: 1, rejectedMarkets: 0,
  candidates: [{ symbol: 'BTCUSDT', venue: 'venue', market: 'crypto', score: 0.9, reasons: ['momentum'], snapshotTs: 1900 }],
  scoreVersion: 'v2', policyVersion: 'v2'
};

test('phase3 candidate requires quorum and records ledger decision', async () => {
  const ledger = new DecisionLedger();
  const pipeline = new Phase3TradingPipeline({
    quorumPolicy: { minSources: 2, maxAgeMs: 500, minQuality: 0.7, maxDisagreementBps: 50 },
    watchdogPolicy: { maxFeedLagMs: 1000, maxQueueLagMs: 1000, maxDbLagMs: 1000, maxWorkerLossRatio: 0.5, maxMemoryPressure: 0.9, maxCpuPressure: 0.9 },
    ledger,
  });
  const assessment = await pipeline.assessCandidate({
    scan,
    candidate: scan.candidates[0],
    observations: [
      { sourceId: 'a', market: 'BTCUSDT', asOf: 1950, value: 100, quality: 0.9 },
      { sourceId: 'b', market: 'BTCUSDT', asOf: 1940, value: 100.2, quality: 0.95 },
    ],
    decision: { agentId: 'worker-1', action: 'buy', market: 'crypto', rationale: 'test', confidence: 0.9, evidenceIds: ['e1'], strategyId: 's1', modelProvider: 'test', modelVersion: '1' },
    watchdogSnapshot: { feedLagMs: 10, queueLagMs: 10, dbLagMs: 10, workerLossRatio: 0, memoryPressure: 0.1, cpuPressure: 0.1 },
  }, 2000);
  assert.equal(assessment.ok, true);
  assert.equal(ledger.list().length, 1);
});

test('phase3 candidate rejects quorum disagreement', async () => {
  const pipeline = new Phase3TradingPipeline({
    quorumPolicy: { minSources: 2, maxAgeMs: 500, minQuality: 0.7, maxDisagreementBps: 5 },
    watchdogPolicy: { maxFeedLagMs: 1000, maxQueueLagMs: 1000, maxDbLagMs: 1000, maxWorkerLossRatio: 0.5, maxMemoryPressure: 0.9, maxCpuPressure: 0.9 },
  });
  const assessment = await pipeline.assessCandidate({
    scan, candidate: scan.candidates[0],
    observations: [
      { sourceId: 'a', market: 'BTCUSDT', asOf: 1950, value: 100, quality: 0.9 },
      { sourceId: 'b', market: 'BTCUSDT', asOf: 1940, value: 102, quality: 0.95 },
    ],
    decision: { agentId: 'worker-1', action: 'buy', market: 'crypto', rationale: 'test', confidence: 0.9, evidenceIds: ['e1'], strategyId: 's1', modelProvider: 'test', modelVersion: '1' },
    watchdogSnapshot: { feedLagMs: 10, queueLagMs: 10, dbLagMs: 10, workerLossRatio: 0, memoryPressure: 0.1, cpuPressure: 0.1 },
  }, 2000);
  assert.equal(assessment.ok, false);
  assert.equal(assessment.reasons[0], 'quorum_disagreement_exceeded');
});

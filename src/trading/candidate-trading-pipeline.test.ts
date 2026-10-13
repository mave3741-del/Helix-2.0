import test from 'node:test';
import assert from 'node:assert/strict';
import { CandidateTradingPipeline } from './candidate-trading-pipeline.ts';
import { InMemoryEvidenceStore, buildEvidencePacket } from './evidence.ts';
import { InMemoryTradingWorkerRegistry } from './runtime/worker-registry.ts';
import { InMemoryTaskQueue } from './runtime/task-queue.ts';
import { ServerTradingRuntime } from './runtime/runtime.ts';

const candidate = { symbol:'BTCUSDT', venue:'paper', market:'crypto' as const, score:.9, reasons:['momentum'], snapshotTs:1000 };
const scan = { scanId:'scan-1', cadence:'normal' as const, startedAt:900, completedAt:1100, universeSize:1, validMarkets:1, rejectedMarkets:0, candidates:[candidate], scoreVersion:'v2', policyVersion:'v2' };
const risk = { capital:10000, maxPositionPct:.2, maxOrderPct:.02, maxDailyLossPct:.02, maxDrawdownPct:.1, maxLeverage:2 };

async function setup() {
  const evidence = new InMemoryEvidenceStore();
  await evidence.append(await buildEvidencePacket({ evidenceId:'e1', subjectId:'BTCUSDT', evidenceType:'market', claim:'supportive', confidence:.9, source:'test', eventTs:900, retrievedTs:1000, availableTs:1000, payload:{symbol:'BTCUSDT'}, quality:{score:.9, dimensions:{sourceTier:1, pointInTime:1, provenance:1, freshness:1, completeness:1}, reasons:[]} }));
  const workers = new InMemoryTradingWorkerRegistry(); await workers.ensureSeeded(1000);
  const queue = new InMemoryTaskQueue();
  const runtime = new ServerTradingRuntime({capital:10000, risk}, undefined as any, undefined as any, queue, undefined as any);
  return { pipeline:new CandidateTradingPipeline(evidence, workers, queue, runtime), evidence };
}

test('candidate requires PIT evidence and queues a specialist', async () => {
  const {pipeline} = await setup();
  const result = await pipeline.prepare({scan,candidate,evidenceIds:['e1'],equity:10000,risk,tick:{bid:100,ask:101,bidSize:10,askSize:10,receivedTs:1100}});
  assert.equal(result.stage,'worker-queued'); assert.ok(result.workerId); assert.deepEqual(result.evidenceIds,['e1']);
});

test('candidate without evidence fails closed', async () => {
  const {pipeline} = await setup();
  const result = await pipeline.prepare({scan,candidate,evidenceIds:[],equity:10000,risk,tick:{bid:100,ask:101,bidSize:10,askSize:10,receivedTs:1100}});
  assert.equal(result.stage,'rejected'); assert.equal(result.rejectionReason,'evidence_required');
});

test('future candidate snapshot fails closed', async () => {
  const {pipeline} = await setup();
  const future = {...candidate,snapshotTs:1200};
  const result = await pipeline.prepare({scan,candidate:future,evidenceIds:['e1'],equity:10000,risk,tick:{bid:100,ask:101,bidSize:10,askSize:10,receivedTs:1100}});
  assert.equal(result.rejectionReason,'future_candidate_snapshot');
});

test('risk veto prevents paper submission', async () => {
  const {pipeline} = await setup();
  const prepared = await pipeline.prepare({scan,candidate,evidenceIds:['e1'],equity:10000,risk,tick:{bid:100,ask:101,bidSize:10,askSize:10,receivedTs:1100}});
  const result = await pipeline.paperSubmit({scan,candidate,evidenceIds:['e1'],equity:10000,risk,tick:{bid:100,ask:101,bidSize:10,askSize:10,receivedTs:1100}}, prepared, 'buy', 100);
  assert.equal(result.stage,'rejected'); assert.equal(result.rejectionReason,'risk_veto');
});

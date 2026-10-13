import assert from 'node:assert/strict';
import test from 'node:test';
import { InMemoryClosedLoopStore } from './closed-loop.ts';
import { createRuntimeClosedLoopService } from './runtime-closed-loop.ts';
import { ServerTradingRuntime } from '../runtime/runtime.ts';
import { PaperOperationSession } from '../ops/paper-operations.ts';

function activePaperSession(id = 'learning-paper-session') { const session = new PaperOperationSession({ sessionId: id, readinessReady: true, ownerApprovalActive: true, liveExecutionEnabled: false }); session.arm(1); session.start(2); return session; }

const config = { paperOperationSession: activePaperSession(), capital:100_000, risk:{ capital:100_000, maxPositionPct:.1, maxOrderPct:.02, maxDailyLossPct:.02, maxDrawdownPct:.1, maxLeverage:2 } } as const;
const profile = { strategyId:'paper-a', experimentId:'exp-a', expectedReturn:.1, volatility:.1, sharpe:1, robustness:.8, turnover:.1, correlationToPortfolio:.1, status:'champion' as const };
const policy = { minTrades:1, maxDrawdown:10, minRobustness:.7, maxStrategies:3, maxWeight:.8, minWeight:.05, retireAfterNegativeCycles:3 };

test('runtime closed-loop service requires paper mode and remains stopped until explicitly started', () => {
  const runtime = new ServerTradingRuntime({ ...config, snapshotStore: undefined }, undefined, undefined, undefined, undefined);
  const service = createRuntimeClosedLoopService(runtime, { policy, profiles:[profile], intervalMs:1000, store:new InMemoryClosedLoopStore() });
  assert.equal(service.isRunning(), false);
  service.start();
  assert.equal(service.isRunning(), true);
  service.stop();
  assert.equal(service.isRunning(), false);
});

test('runtime closed-loop service rejects sub-second intervals', () => {
  const runtime = new ServerTradingRuntime({ ...config });
  assert.throws(() => createRuntimeClosedLoopService(runtime, { policy, profiles:[profile], intervalMs:999, store:new InMemoryClosedLoopStore() }), /invalid_closed_loop_interval/);
});

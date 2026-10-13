import test from 'node:test';
import assert from 'node:assert/strict';
import { RuntimeOperationalHealthCoordinator } from './operational-health-coordinator.ts';

const scan = { universeSize: 1000, validMarkets: 990 } as const;
const quorum = {
  acceptedSources: ['a', 'b'],
  rejectedSources: [{ sourceId: 'c', reason: 'quality_below_threshold' }],
} as const;
const watchdog = { mode: 'normal' } as const;
const reconciliation = { status: 'reconciled', decisionHash: 'recon-hash' } as const;

test('coordinator aggregates authoritative scan/quorum/watchdog/reconciliation context', () => {
  const coordinator = new RuntimeOperationalHealthCoordinator();
  coordinator.observeScan(scan as never);
  coordinator.observeQuorum(quorum as never, 3);
  coordinator.observeWatchdog(watchdog as never);
  coordinator.observeReconciliation(reconciliation as never);
  const context = coordinator.context({ paperFillCount: 4, paperNetPnl: 12.5 });
  assert.equal(context.marketCount, 1000);
  assert.equal(context.freshQuoteRatio, 0.99);
  assert.equal(context.quorumAgreementRatio, 2 / 3);
  assert.equal(context.governanceStatus, 'reconciled');
  assert.equal(context.watchdogStatus, 'normal');
  assert.equal(context.reconciliationHash, 'recon-hash');
  assert.equal(context.paperFillCount, 4);
});

test('coordinator resets to conservative fail-closed state', () => {
  const coordinator = new RuntimeOperationalHealthCoordinator();
  coordinator.observeScan(scan as never);
  coordinator.observeReconciliation(reconciliation as never);
  coordinator.reset();
  const context = coordinator.context({ paperFillCount: 0, paperNetPnl: 0 });
  assert.equal(context.marketCount, 0);
  assert.equal(context.quorumAgreementRatio, 0);
  assert.equal(context.governanceStatus, 'fail_closed');
  assert.equal(context.watchdogStatus, 'halted');
  assert.equal(context.reconciliationHash, null);
});

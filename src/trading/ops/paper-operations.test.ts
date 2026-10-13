import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PaperOperationSession, isPaperOnlySession } from './paper-operations.ts';

const healthy = () => new PaperOperationSession({
  sessionId: 'paper-001',
  readinessReady: true,
  ownerApprovalActive: true,
  liveExecutionEnabled: false,
});

test('starts only with readiness, owner approval, and live execution disabled', () => {
  assert.throws(() => new PaperOperationSession({ readinessReady: false, ownerApprovalActive: true, liveExecutionEnabled: false }), /readiness_not_ready/);
  assert.throws(() => new PaperOperationSession({ readinessReady: true, ownerApprovalActive: false, liveExecutionEnabled: false }), /owner_approval_required/);
  assert.throws(() => new PaperOperationSession({ readinessReady: true, ownerApprovalActive: true, liveExecutionEnabled: true }), /live_execution_forbidden/);
});

test('enforces planned -> armed -> running lifecycle', () => {
  const s = healthy();
  assert.throws(() => s.start(), /invalid_start_state/);
  s.arm(1);
  const running = s.start(2);
  assert.equal(running.state, 'running');
});

test('automatically rolls back on reconciliation mismatch', () => {
  const s = healthy(); s.arm(1); s.start(2);
  const snap = s.recordMetrics({ observationCycles: 20, rejectedOrders: 0, reconciliationMismatches: 1, criticalAlerts: 0, p95LatencyMs: 100 }, 3);
  assert.equal(snap.state, 'rollback');
  assert.ok(snap.events.at(-1)?.reason.includes('reconciliation_mismatch'));
});

test('automatically rolls back on rejection-rate breach', () => {
  const s = healthy(); s.arm(1); s.start(2);
  const snap = s.recordMetrics({ observationCycles: 10, rejectedOrders: 2, reconciliationMismatches: 0, criticalAlerts: 0, p95LatencyMs: 100 }, 3);
  assert.equal(snap.state, 'rollback');
  assert.ok(snap.events.at(-1)?.reason.includes('rejection_rate_exceeded'));
});

test('automatic rollback becomes terminal only after abort', () => {
  const s = healthy(); s.arm(1); s.start(2); s.rollback('operator_rollback', 3);
  assert.equal(s.snapshot().state, 'rollback');
  const aborted = s.abort('rollback_complete', 4);
  assert.equal(aborted.state, 'aborted');
  assert.throws(() => s.start(), /invalid_start_state/);
});

test('completion is blocked when policy is violated', () => {
  const s = healthy(); s.arm(1); s.start(2);
  s.pause('operator_pause', 3);
  s.resume(4);
  s.recordMetrics({ observationCycles: 10, rejectedOrders: 3, reconciliationMismatches: 0, criticalAlerts: 0, p95LatencyMs: 100 }, 5);
  assert.throws(() => s.complete(6), /invalid_complete_state/);
});

test('healthy session can complete', () => {
  const s = healthy(); s.arm(1); s.start(2);
  s.recordMetrics({ observationCycles: 20, rejectedOrders: 1, reconciliationMismatches: 0, criticalAlerts: 0, p95LatencyMs: 100 }, 3);
  const done = s.complete(4);
  assert.equal(done.state, 'completed');
});

test('transition journal hashes chain previous state', () => {
  const s = healthy(); s.arm(1); s.start(2); s.pause('pause', 3); s.resume(4);
  const events = s.snapshot().events;
  assert.equal(events.length, 4);
  assert.notEqual(events[0].hash, events[1].hash);
  assert.notEqual(events[1].hash, events[2].hash);
});

test('pause/resume cannot bypass terminal state', () => {
  const s = healthy(); s.arm(1); s.start(2); s.abort('stop', 3);
  assert.throws(() => s.resume(4), /invalid_resume_state|terminal/);
});

test('paper-only invariant remains true across lifecycle', () => {
  const s = healthy(); s.arm(1); s.start(2);
  assert.equal(isPaperOnlySession(s.snapshot()), true);
  s.abort('done', 3);
  assert.equal(isPaperOnlySession(s.snapshot()), true);
});

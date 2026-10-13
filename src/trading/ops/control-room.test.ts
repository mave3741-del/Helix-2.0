import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PaperControlRoom, classifyControlRoomIncident, CONTROL_ROOM_RUNBOOKS } from './control-room.ts';
import { PaperOperationSession } from './paper-operations.ts';

function session(): PaperOperationSession {
  const value = new PaperOperationSession({ readinessReady: true, ownerApprovalActive: true, liveExecutionEnabled: false, sessionId: 'control-room-001' });
  value.arm(1);
  value.start(2);
  return value;
}

function event(name: string, severity: 'info' | 'warning' | 'critical', message = name) {
  return { ts: 10, severity, name, message, attributes: {} } as const;
}

test('classifies core control-room incident families', () => {
  assert.equal(classifyControlRoomIncident('reconciliation_mismatch'), 'reconciliation');
  assert.equal(classifyControlRoomIncident('database_lag'), 'database');
  assert.equal(classifyControlRoomIncident('feed_stale'), 'market_data');
  assert.equal(classifyControlRoomIncident('worker_queue_lag'), 'worker');
  assert.equal(classifyControlRoomIncident('p95_latency'), 'latency');
  assert.equal(classifyControlRoomIncident('security_escape'), 'security');
  assert.equal(classifyControlRoomIncident('paper_session_pause'), 'paper_session');
  assert.equal(classifyControlRoomIncident('unclassified_alarm'), 'unknown');
});

test('critical reconciliation routes to rollback and records operator runbook', () => {
  const s = session();
  const room = new PaperControlRoom(s);
  const route = room.route(event('reconciliation_mismatch', 'critical'), 3);
  assert.equal(route.incident, 'reconciliation');
  assert.equal(route.autoAction, 'rollback_paper');
  assert.equal(route.operatorRequired, true);
  assert.equal(s.snapshot().state, 'rollback');
  assert.equal(route.runbook.length, CONTROL_ROOM_RUNBOOKS.reconciliation.length);
  assert.equal(route.routeHash.length, 64);
});

test('critical security event aborts a paper session', () => {
  const s = session();
  const room = new PaperControlRoom(s);
  room.route(event('security_boundary_violation', 'critical'), 4);
  assert.equal(s.snapshot().state, 'aborted');
});

test('warning market-data issue halts new candidates without aborting session', () => {
  const s = session();
  const room = new PaperControlRoom(s);
  const route = room.route(event('feed_stale', 'warning'), 5);
  assert.equal(route.action, 'halt_new_candidates');
  assert.equal(route.autoAction, null);
  assert.equal(s.snapshot().state, 'running');
});

test('critical routes increment control-room incident metrics and preserve last route', () => {
  const room = new PaperControlRoom();
  room.route(event('worker_loss', 'critical'), 6);
  room.route(event('queue_lag', 'critical'), 7);
  const state = room.snapshot();
  assert.equal(state.routeCount, 2);
  assert.equal(state.criticalRoutes, 2);
  assert.equal(state.lastRoute?.incident, 'worker');
  assert.equal(state.metrics.criticalAlerts, 2);
});

test('runbooks are non-empty and ordered', () => {
  for (const [incident, steps] of Object.entries(CONTROL_ROOM_RUNBOOKS)) {
    assert.ok(steps.length >= 2, incident);
    assert.deepEqual(steps.map((step) => step.sequence), steps.map((_, index) => index + 1));
    assert.ok(steps.every((step) => step.required));
  }
});

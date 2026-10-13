import assert from 'node:assert/strict';
import { test } from 'node:test';
import { InMemoryPaperOperationSessionStore } from './paper-operation-persistence.ts';
import { PaperOperationSession } from './paper-operations.ts';

function runningSession(): PaperOperationSession {
  const session = new PaperOperationSession({ readinessReady: true, ownerApprovalActive: true, liveExecutionEnabled: false, sessionId: 'recover-001' });
  session.arm(1);
  session.start(2);
  return session;
}

test('persists and restores a paper session with intact journal', async () => {
  const store = new InMemoryPaperOperationSessionStore();
  const original = runningSession().snapshot();
  await store.save(original);
  const loaded = await store.load(original.sessionId);
  assert.deepEqual(loaded, original);
});

test('running session recovers into paused state', async () => {
  const store = new InMemoryPaperOperationSessionStore();
  await store.save(runningSession().snapshot());
  const recovered = await store.recover('recover-001', 10);
  assert.equal(recovered?.state, 'paused');
  assert.equal(recovered?.events.at(-1)?.reason, 'process_restart_recovery');
});

test('recovery is idempotent after first pause', async () => {
  const store = new InMemoryPaperOperationSessionStore();
  await store.save(runningSession().snapshot());
  const once = await store.recover('recover-001', 10);
  const twice = await store.recover('recover-001', 20);
  assert.equal(once?.events.length, 3);
  assert.equal(twice?.events.length, 3);
  assert.deepEqual(twice?.events.at(-1), once?.events.at(-1));
});

test('tampered snapshot is rejected before recovery', async () => {
  const store = new InMemoryPaperOperationSessionStore();
  const original = runningSession().snapshot();
  await store.save(original);
  const loaded = await store.load(original.sessionId);
  assert.ok(loaded);
  loaded.events[1].reason = 'tampered';
  await assert.rejects(() => store.save(loaded), /snapshot_hash_mismatch|event_hash_mismatch/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { NativeToolApprovalService, InMemoryNativeToolApprovalStore } from './approval-service.ts';
import { advanceNativeToolLifecycle, builtInTradingTools, InMemoryNativeToolRegistryStore, registerNativeTool } from './factory.ts';

function setup() {
  const registry = new InMemoryNativeToolRegistryStore();
  const audit = new InMemoryNativeToolApprovalStore();
  const service = new NativeToolApprovalService(registry, audit);
  const map = new Map();
  const record = registerNativeTool(map, builtInTradingTools().find((x) => x.id === 'native.rsi')!, 'phase8.13-test');
  advanceNativeToolLifecycle(map, record.id, 'tested');
  return { registry, audit, service, record: map.get(record.id)! };
}

const good = { reviewer: 'reviewer-a', implementer: 'builder-b', evidenceIds: ['test:42', 'audit:7'], conflictDeclared: true, reason: 'Independent review completed.', expiresAt: Date.now() + 86_400_000 };

test('approval requires independent reviewer', async () => {
  const { registry, service, record } = setup();
  await registry.upsert(record);
  await assert.rejects(() => service.approve({ toolId: record.id, ...good, reviewer: 'builder-b' }), /reviewer_must_differ/i);
});

test('approval requires evidence and conflict declaration', async () => {
  const { registry, service, record } = setup();
  await registry.upsert(record);
  await assert.rejects(() => service.approve({ toolId: record.id, ...good, evidenceIds: [] }), /evidence/i);
  await assert.rejects(() => service.approve({ toolId: record.id, ...good, conflictDeclared: false }), /conflict/i);
});

test('tested tool can be approved and audit is persisted', async () => {
  const { registry, audit, service, record } = setup();
  await registry.upsert(record);
  const result = await service.approve({ toolId: record.id, ...good });
  assert.equal(result.action, 'approve');
  assert.equal(result.fromLifecycle, 'tested');
  assert.equal(result.toLifecycle, 'approved');
  assert.equal((await registry.get(record.id))?.lifecycle, 'approved');
  assert.equal((await audit.list(record.id)).length, 1);
  assert.match(result.evidenceHash, /^[0-9a-f]{64}$/);
});

test('deployment requires approved lifecycle', async () => {
  const { registry, service, record } = setup();
  await registry.upsert(record);
  await assert.rejects(() => service.deploy({ toolId: record.id, ...good }), /requires_approved/i);
});

test('approved tool can be deployed by a separately reviewed decision', async () => {
  const { registry, audit, service, record } = setup();
  await registry.upsert(record);
  await service.approve({ toolId: record.id, ...good });
  const result = await service.deploy({ toolId: record.id, ...good, reviewer: 'reviewer-c' });
  assert.equal(result.fromLifecycle, 'approved');
  assert.equal(result.toLifecycle, 'deployed');
  assert.equal((await registry.get(record.id))?.lifecycle, 'deployed');
  assert.equal((await audit.list(record.id)).length, 2);
});

test('fingerprint drift blocks approval', async () => {
  const { registry, service, record } = setup();
  await registry.upsert({ ...record, implementationHash: 'f'.repeat(64) });
  await assert.rejects(() => service.approve({ toolId: record.id, ...good }), /fingerprint_drift/i);
});

test('unsafe tool cannot be approved', async () => {
  const { registry, service, record } = setup();
  await registry.upsert({ ...record, safety: { sandboxed: true, credentialsAllowed: true, walletAccess: false } });
  await assert.rejects(() => service.approve({ toolId: record.id, ...good }), /safety_policy/i);
});

test('reject records an immutable decision without changing lifecycle', async () => {
  const { registry, audit, service, record } = setup();
  await registry.upsert(record);
  const result = await service.reject({ toolId: record.id, ...good, reason: 'Evidence insufficient for production deployment.' });
  assert.equal(result.action, 'reject');
  assert.equal(result.fromLifecycle, 'tested');
  assert.equal(result.toLifecycle, 'tested');
  assert.equal((await registry.get(record.id))?.lifecycle, 'tested');
  assert.equal((await audit.list(record.id)).length, 1);
});


test('approval requires bounded future expiry', async () => {
  const { registry, service, record } = setup();
  await registry.upsert(record);
  await assert.rejects(() => service.approve({ toolId: record.id, ...good, expiresAt: Date.now() - 1 }), /expiry_must_be_in_the_future/i);
  await assert.rejects(() => service.approve({ toolId: record.id, ...good, expiresAt: Date.now() + 91 * 24 * 60 * 60 * 1000 }), /expiry_too_far/i);
});

test('approval decision carries an immutable decision hash', async () => {
  const { registry, service, audit, record } = setup();
  await registry.upsert(record);
  const result = await service.approve({ toolId: record.id, ...good });
  assert.match(result.decisionHash, /^[0-9a-f]{64}$/);
  assert.equal((await audit.list(record.id))[0]?.decisionHash, result.decisionHash);
});

test('deployment refuses an expired prior approval', async () => {
  const { registry, service, record } = setup();
  await registry.upsert(record);
  await service.approve({ toolId: record.id, ...good, expiresAt: Date.now() + 5 });
  await new Promise((resolve) => setTimeout(resolve, 10));
  await assert.rejects(() => service.deploy({ toolId: record.id, ...good }), /expired_or_missing/i);
});

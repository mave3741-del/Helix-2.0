import { createHash } from 'node:crypto';
import { builtInTradingTools, nativeToolFingerprint, type NativeToolLifecycle, type NativeToolRecord, type NativeToolRegistryStore } from './factory.ts';

export type NativeToolApprovalAction = 'approve' | 'deploy' | 'reject';

export interface NativeToolApprovalRequest {
  toolId: string;
  reviewer: string;
  implementer: string;
  evidenceIds: string[];
  conflictDeclared: boolean;
  reason: string;
  expiresAt: number;
}

export interface NativeToolApprovalRecord {
  id: string;
  toolId: string;
  action: NativeToolApprovalAction;
  fromLifecycle: NativeToolLifecycle;
  toLifecycle: NativeToolLifecycle;
  reviewer: string;
  implementer: string;
  conflictDeclared: boolean;
  evidenceIds: string[];
  evidenceHash: string;
  reason: string;
  toolSchemaHash: string;
  toolImplementationHash: string;
  createdAt: number;
  expiresAt: number;
  decisionHash: string;
}

export interface NativeToolApprovalStore {
  append(record: NativeToolApprovalRecord): Promise<NativeToolApprovalRecord>;
  list(toolId?: string): Promise<NativeToolApprovalRecord[]>;
}

export class InMemoryNativeToolApprovalStore implements NativeToolApprovalStore {
  private readonly records: NativeToolApprovalRecord[] = [];
  async append(record: NativeToolApprovalRecord) {
    this.records.push({ ...record, evidenceIds: [...record.evidenceIds] });
    return { ...record, evidenceIds: [...record.evidenceIds] };
  }
  async list(toolId?: string) {
    return this.records.filter((r) => toolId == null || r.toolId === toolId).map((r) => ({ ...r, evidenceIds: [...r.evidenceIds] }));
  }
}

interface SqlLikeApprovalStore { query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>; }

function rowToRecord(row: Record<string, unknown>): NativeToolApprovalRecord {
  const ids = typeof row.evidence_ids === 'string' ? JSON.parse(row.evidence_ids) as string[] : row.evidence_ids as string[];
  return {
    id: String(row.approval_id),
    toolId: String(row.tool_id),
    action: String(row.action) as NativeToolApprovalAction,
    fromLifecycle: String(row.from_lifecycle) as NativeToolLifecycle,
    toLifecycle: String(row.to_lifecycle) as NativeToolLifecycle,
    reviewer: String(row.reviewer),
    implementer: String(row.implementer),
    conflictDeclared: Boolean(row.conflict_declared),
    evidenceIds: Array.isArray(ids) ? ids.map(String) : [],
    evidenceHash: String(row.evidence_hash),
    reason: String(row.reason),
    toolSchemaHash: String(row.tool_schema_hash),
    toolImplementationHash: String(row.tool_implementation_hash),
    createdAt: new Date(String(row.created_at)).getTime(),
    expiresAt: new Date(String(row.expires_at)).getTime(),
    decisionHash: String(row.decision_hash),
  };
}

export class SqlNativeToolApprovalStore implements NativeToolApprovalStore {
  private sqlPromise: Promise<SqlLikeApprovalStore> | null = null;
  private sql(): Promise<SqlLikeApprovalStore> {
    this.sqlPromise ??= import('../../lib/db.ts').then(({ getSql }) => getSql());
    return this.sqlPromise;
  }
  async append(record: NativeToolApprovalRecord) {
    const sql = await this.sql();
    const rows = await sql.query<Record<string, unknown>>(
      `insert into trading_native_tool_approvals
        (approval_id,tool_id,action,from_lifecycle,to_lifecycle,reviewer,implementer,conflict_declared,evidence_ids,evidence_hash,reason,tool_schema_hash,tool_implementation_hash,created_at,expires_at,decision_hash)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12,$13,to_timestamp($14/1000.0),to_timestamp($15/1000.0),$16)
       returning *`,
      [record.id, record.toolId, record.action, record.fromLifecycle, record.toLifecycle, record.reviewer, record.implementer, record.conflictDeclared, JSON.stringify(record.evidenceIds), record.evidenceHash, record.reason, record.toolSchemaHash, record.toolImplementationHash, record.createdAt, record.expiresAt, record.decisionHash],
    );
    if (!rows[0]) throw new Error('native_tool_approval_append_failed');
    return rowToRecord(rows[0]);
  }
  async list(toolId?: string) {
    const sql = await this.sql();
    const rows = await sql.query<Record<string, unknown>>(
      toolId ? 'select * from trading_native_tool_approvals where tool_id=$1 order by created_at asc' : 'select * from trading_native_tool_approvals order by created_at asc',
      toolId ? [toolId] : [],
    );
    return rows.map(rowToRecord);
  }
}

function hashEvidence(evidenceIds: string[]): string {
  return createHash('sha256').update(evidenceIds.slice().sort().join('\n'), 'utf8').digest('hex');
}


function decisionHash(record: Omit<NativeToolApprovalRecord, 'decisionHash'>): string {
  return createHash('sha256').update(JSON.stringify({
    id: record.id, toolId: record.toolId, action: record.action, fromLifecycle: record.fromLifecycle, toLifecycle: record.toLifecycle,
    reviewer: record.reviewer, implementer: record.implementer, conflictDeclared: record.conflictDeclared, evidenceIds: [...record.evidenceIds].sort(),
    evidenceHash: record.evidenceHash, reason: record.reason, toolSchemaHash: record.toolSchemaHash, toolImplementationHash: record.toolImplementationHash,
    createdAt: record.createdAt, expiresAt: record.expiresAt,
  })).digest('hex');
}

function assertExpiry(expiresAt: number, now = Date.now()): void {
  if (!Number.isFinite(expiresAt) || expiresAt <= now) throw new Error('approval_expiry_must_be_in_the_future');
  const maxLifetime = 90 * 24 * 60 * 60 * 1000;
  if (expiresAt - now > maxLifetime) throw new Error('approval_expiry_too_far_in_future');
}

function assertReviewerSeparation(request: NativeToolApprovalRequest): void {
  if (!request.reviewer.trim() || !request.implementer.trim()) throw new Error('reviewer_and_implementer_required');
  if (request.reviewer.trim() === request.implementer.trim()) throw new Error('reviewer_must_differ_from_implementer');
  if (!request.conflictDeclared) throw new Error('conflict_declaration_required');
  if (!request.reason.trim()) throw new Error('approval_reason_required');
  if (!request.evidenceIds.length) throw new Error('approval_evidence_required');
  assertExpiry(request.expiresAt);
}

function transition(record: NativeToolRecord, target: 'approved' | 'deployed'): NativeToolRecord {
  const expected: Record<'approved' | 'deployed', NativeToolLifecycle> = { approved: 'tested', deployed: 'approved' };
  if (record.lifecycle !== expected[target]) throw new Error(`native_tool_${target}_requires_${expected[target]}`);
  return { ...record, lifecycle: target, updatedAt: Date.now() };
}

export class NativeToolApprovalService {
  private readonly registry: NativeToolRegistryStore;
  private readonly approvals: NativeToolApprovalStore;

  constructor(registry: NativeToolRegistryStore, approvals: NativeToolApprovalStore) {
    this.registry = registry;
    this.approvals = approvals;
  }

  async approve(request: NativeToolApprovalRequest): Promise<NativeToolApprovalRecord> {
    assertReviewerSeparation(request);
    const record = await this.requireCurrent(request.toolId);
    this.assertCurrentBuiltinFingerprint(record);
    const updated = transition(record, 'approved');
    await this.registry.upsert(updated);
    return this.writeApproval(record, updated, 'approve', request);
  }

  async deploy(request: NativeToolApprovalRequest): Promise<NativeToolApprovalRecord> {
    assertReviewerSeparation(request);
    const record = await this.requireCurrent(request.toolId);
    this.assertCurrentBuiltinFingerprint(record);
    if (record.lifecycle !== 'approved') throw new Error('native_tool_deploy_requires_approved');
    const prior = (await this.approvals.list(request.toolId)).filter((x) => x.action === 'approve').at(-1);
    if (!prior || prior.expiresAt <= Date.now()) throw new Error('approved_decision_expired_or_missing');
    const updated = transition(record, 'deployed');
    await this.registry.upsert(updated);
    return this.writeApproval(record, updated, 'deploy', request);
  }

  async reject(request: NativeToolApprovalRequest): Promise<NativeToolApprovalRecord> {
    assertReviewerSeparation(request);
    const record = await this.requireCurrent(request.toolId);
    this.assertCurrentBuiltinFingerprint(record);
    const audit: NativeToolApprovalRecord = {
      id: approvalId(record.id, 'reject', Date.now()),
      toolId: record.id,
      action: 'reject',
      fromLifecycle: record.lifecycle,
      toLifecycle: record.lifecycle,
      reviewer: request.reviewer.trim(),
      implementer: request.implementer.trim(),
      conflictDeclared: request.conflictDeclared,
      evidenceIds: [...request.evidenceIds],
      evidenceHash: hashEvidence(request.evidenceIds),
      reason: request.reason.trim(),
      toolSchemaHash: record.schemaHash,
      toolImplementationHash: record.implementationHash,
      createdAt: Date.now(),
      expiresAt: request.expiresAt,
      decisionHash: '',
    };
    audit.decisionHash = decisionHash(audit);
    return this.approvals.append(audit);
  }

  private async requireCurrent(toolId: string): Promise<NativeToolRecord> {
    const record = await this.registry.get(toolId);
    if (!record) throw new Error(`native_tool_not_found:${toolId}`);
    if (!record.id.startsWith('native.')) throw new Error('native_tool_namespace_required');
    if (!record.safety.sandboxed || record.safety.credentialsAllowed || record.safety.walletAccess) throw new Error('native_tool_safety_policy_failed');
    return record;
  }

  private assertCurrentBuiltinFingerprint(record: NativeToolRecord): void {
    const builtIn = builtInTradingTools().find((x) => x.id === record.id);
    if (!builtIn) return;
    const fingerprint = nativeToolFingerprint(builtIn);
    if (record.schemaHash !== fingerprint.schemaHash || record.implementationHash !== fingerprint.implementationHash) {
      throw new Error(`native_tool_fingerprint_drift:${record.id}`);
    }
  }

  private async writeApproval(from: NativeToolRecord, to: NativeToolRecord, action: 'approve' | 'deploy', request: NativeToolApprovalRequest): Promise<NativeToolApprovalRecord> {
    const audit: NativeToolApprovalRecord = {
      id: approvalId(from.id, action, to.updatedAt),
      toolId: from.id, action, fromLifecycle: from.lifecycle, toLifecycle: to.lifecycle,
      reviewer: request.reviewer.trim(), implementer: request.implementer.trim(), conflictDeclared: request.conflictDeclared,
      evidenceIds: [...request.evidenceIds], evidenceHash: hashEvidence(request.evidenceIds), reason: request.reason.trim(),
      toolSchemaHash: to.schemaHash, toolImplementationHash: to.implementationHash, createdAt: to.updatedAt,
      expiresAt: request.expiresAt, decisionHash: '',
    };
    audit.decisionHash = decisionHash(audit);
    return this.approvals.append(audit);
  }
}

function approvalId(toolId: string, action: NativeToolApprovalAction, timestamp: number): string {
  return createHash('sha256').update(`${toolId}:${action}:${timestamp}`).digest('hex').slice(0, 32);
}

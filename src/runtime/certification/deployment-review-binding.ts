import { createHash } from 'node:crypto';
import type { DeploymentAttestationPayload } from '../../trading/deployment-attestation.ts';

export interface DeploymentReviewBindingRequest {
  decisionHash: string;
  reviewer: string;
  implementer: string;
  decisionAction: 'approve' | 'deploy';
  deploymentId: string;
  expectedAppVersion: string;
  decisionExpiresAt: number;
  attestation: DeploymentAttestationPayload;
  now?: number;
}

export interface DeploymentReviewBinding {
  bindingId: string;
  decisionHash: string;
  deploymentId: string;
  appVersion: string;
  attestationHash: string;
  reviewer: string;
  implementer: string;
  decisionAction: 'approve' | 'deploy';
  createdAt: number;
  expiresAt: number;
  bindingHash: string;
}

function sha256(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex');
}

export function hashDeploymentAttestationPayload(payload: DeploymentAttestationPayload): string {
  return sha256({
    schemaVersion: payload.schemaVersion,
    deploymentId: payload.deploymentId,
    issuedAt: payload.issuedAt,
    expiresAt: payload.expiresAt,
    appVersion: payload.appVersion,
    workerIsolationEnforced: payload.workerIsolationEnforced,
    networkEgressEnforced: payload.networkEgressEnforced,
    secretsIsolationEnforced: payload.secretsIsolationEnforced,
    liveExecutionDisabled: payload.liveExecutionDisabled,
  });
}

function assertHexHash(name: string, value: string): void {
  if (!/^[a-f0-9]{64}$/.test(value)) throw new Error(`${name}_invalid`);
}

export function createDeploymentReviewBinding(input: DeploymentReviewBindingRequest): DeploymentReviewBinding {
  const now = input.now ?? Date.now();
  assertHexHash('decision_hash', input.decisionHash);
  if (!input.reviewer.trim() || !input.implementer.trim()) throw new Error('reviewer_and_implementer_required');
  if (input.reviewer.trim() === input.implementer.trim()) throw new Error('reviewer_must_differ_from_implementer');
  if (!input.decisionAction) throw new Error('decision_action_invalid');
  if (!input.deploymentId.trim()) throw new Error('deployment_id_required');
  if (!input.expectedAppVersion.trim()) throw new Error('expected_app_version_required');
  if (!Number.isFinite(input.decisionExpiresAt) || input.decisionExpiresAt <= now) throw new Error('decision_expired');
  if (input.attestation.schemaVersion !== 1) throw new Error('attestation_schema_invalid');
  if (input.attestation.deploymentId !== input.deploymentId) throw new Error('deployment_id_mismatch');
  if (input.attestation.appVersion !== input.expectedAppVersion) throw new Error('app_version_mismatch');
  if (input.attestation.expiresAt <= now) throw new Error('attestation_expired');
  if (input.attestation.expiresAt > input.decisionExpiresAt) throw new Error('attestation_outlives_decision');
  if (!input.attestation.workerIsolationEnforced) throw new Error('worker_isolation_not_attested');
  if (!input.attestation.networkEgressEnforced) throw new Error('network_egress_not_attested');
  if (!input.attestation.secretsIsolationEnforced) throw new Error('secrets_isolation_not_attested');
  if (!input.attestation.liveExecutionDisabled) throw new Error('live_execution_not_disabled');

  const createdAt = now;
  const expiresAt = Math.min(input.decisionExpiresAt, input.attestation.expiresAt);
  const attestationHash = hashDeploymentAttestationPayload(input.attestation);
  const base = {
    decisionHash: input.decisionHash,
    deploymentId: input.deploymentId.trim(),
    appVersion: input.expectedAppVersion.trim(),
    attestationHash,
    reviewer: input.reviewer.trim(),
    implementer: input.implementer.trim(),
    decisionAction: input.decisionAction,
    createdAt,
    expiresAt,
  };
  const bindingHash = sha256(base);
  return { bindingId: bindingHash.slice(0, 32), ...base, bindingHash };
}

export interface DeploymentReviewBindingStore {
  append(binding: DeploymentReviewBinding): Promise<DeploymentReviewBinding>;
  list(decisionHash?: string): Promise<DeploymentReviewBinding[]>;
}


interface SqlLikeBindingStore {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
}

function rowToBinding(row: Record<string, unknown>): DeploymentReviewBinding {
  return {
    bindingId: String(row.binding_id),
    decisionHash: String(row.decision_hash),
    deploymentId: String(row.deployment_id),
    appVersion: String(row.app_version),
    attestationHash: String(row.attestation_hash),
    reviewer: String(row.reviewer),
    implementer: String(row.implementer),
    decisionAction: String(row.decision_action) as 'approve' | 'deploy',
    createdAt: new Date(String(row.created_at)).getTime(),
    expiresAt: new Date(String(row.expires_at)).getTime(),
    bindingHash: String(row.binding_hash),
  };
}

export class SqlDeploymentReviewBindingStore implements DeploymentReviewBindingStore {
  private sqlPromise: Promise<SqlLikeBindingStore> | null = null;
  private sql(): Promise<SqlLikeBindingStore> {
    this.sqlPromise ??= import('../../lib/db.ts').then(({ getSql }) => getSql());
    return this.sqlPromise;
  }
  async append(binding: DeploymentReviewBinding): Promise<DeploymentReviewBinding> {
    const sql = await this.sql();
    const rows = await sql.query<Record<string, unknown>>(
      `insert into trading_deployment_review_bindings
        (binding_id,decision_hash,deployment_id,app_version,attestation_hash,reviewer,implementer,decision_action,created_at,expires_at,binding_hash)
       values ($1,$2,$3,$4,$5,$6,$7,$8,to_timestamp($9/1000.0),to_timestamp($10/1000.0),$11)
       returning *`,
      [binding.bindingId, binding.decisionHash, binding.deploymentId, binding.appVersion, binding.attestationHash, binding.reviewer, binding.implementer, binding.decisionAction, binding.createdAt, binding.expiresAt, binding.bindingHash],
    );
    if (!rows[0]) throw new Error('deployment_review_binding_append_failed');
    return rowToBinding(rows[0]);
  }
  async list(decisionHash?: string): Promise<DeploymentReviewBinding[]> {
    const sql = await this.sql();
    const rows = await sql.query<Record<string, unknown>>(
      decisionHash
        ? 'select * from trading_deployment_review_bindings where decision_hash=$1 order by created_at asc'
        : 'select * from trading_deployment_review_bindings order by created_at asc',
      decisionHash ? [decisionHash] : [],
    );
    return rows.map(rowToBinding);
  }
}

export class InMemoryDeploymentReviewBindingStore implements DeploymentReviewBindingStore {
  private readonly rows: DeploymentReviewBinding[] = [];
  async append(binding: DeploymentReviewBinding): Promise<DeploymentReviewBinding> {
    if (this.rows.some((row) => row.bindingId === binding.bindingId)) throw new Error('deployment_review_binding_duplicate');
    this.rows.push({ ...binding });
    return { ...binding };
  }
  async list(decisionHash?: string): Promise<DeploymentReviewBinding[]> {
    return this.rows.filter((row) => decisionHash == null || row.decisionHash === decisionHash).map((row) => ({ ...row }));
  }
}

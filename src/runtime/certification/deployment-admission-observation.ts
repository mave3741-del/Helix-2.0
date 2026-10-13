import { createHash, randomUUID } from 'node:crypto';
import type { DeploymentAttestationPayload } from '../../trading/deployment-attestation.ts';
import type { DeploymentAdmissionResult } from './deployment-admission.ts';

export interface DeploymentAdmissionObservationRequest {
  requestId?: string;
  deploymentId: string;
  appVersion: string;
  attestation: DeploymentAttestationPayload;
  result: DeploymentAdmissionResult;
  evaluatedAt: number;
}

export interface DeploymentAdmissionObservation {
  observationId: string;
  requestId: string;
  deploymentId: string;
  appVersion: string;
  allowed: boolean;
  reasons: string[];
  bindingId?: string;
  bindingHash?: string;
  attestationHash: string;
  evaluatedAt: number;
  observationHash: string;
}

export interface DeploymentAdmissionObservationStore {
  append(observation: DeploymentAdmissionObservation): Promise<DeploymentAdmissionObservation>;
  list(deploymentId?: string): Promise<DeploymentAdmissionObservation[]>;
}

function sha256(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex');
}

function hashAttestation(attestation: DeploymentAttestationPayload): string {
  return sha256({
    schemaVersion: attestation.schemaVersion,
    deploymentId: attestation.deploymentId,
    issuedAt: attestation.issuedAt,
    expiresAt: attestation.expiresAt,
    appVersion: attestation.appVersion,
    workerIsolationEnforced: attestation.workerIsolationEnforced,
    networkEgressEnforced: attestation.networkEgressEnforced,
    secretsIsolationEnforced: attestation.secretsIsolationEnforced,
    liveExecutionDisabled: attestation.liveExecutionDisabled,
  });
}

export function createDeploymentAdmissionObservation(input: DeploymentAdmissionObservationRequest): DeploymentAdmissionObservation {
  if (!input.deploymentId.trim()) throw new Error('admission_deployment_id_required');
  if (!input.appVersion.trim()) throw new Error('admission_app_version_required');
  if (!Number.isFinite(input.evaluatedAt)) throw new Error('admission_evaluated_at_invalid');

  const requestId = input.requestId?.trim() || randomUUID();
  const base = {
    requestId,
    deploymentId: input.deploymentId.trim(),
    appVersion: input.appVersion.trim(),
    allowed: input.result.allowed,
    reasons: [...new Set(input.result.reasons)].sort(),
    bindingId: input.result.binding?.bindingId,
    bindingHash: input.result.binding?.bindingHash,
    attestationHash: hashAttestation(input.attestation),
    evaluatedAt: input.evaluatedAt,
  };
  const observationHash = sha256(base);
  return {
    observationId: observationHash.slice(0, 32),
    ...base,
    observationHash,
  };
}

interface SqlLikeAdmissionObservationStore {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
}

function rowToObservation(row: Record<string, unknown>): DeploymentAdmissionObservation {
  return {
    observationId: String(row.observation_id),
    requestId: String(row.request_id),
    deploymentId: String(row.deployment_id),
    appVersion: String(row.app_version),
    allowed: Boolean(row.allowed),
    reasons: Array.isArray(row.reasons) ? row.reasons.map(String) : [],
    bindingId: row.binding_id == null ? undefined : String(row.binding_id),
    bindingHash: row.binding_hash == null ? undefined : String(row.binding_hash),
    attestationHash: String(row.attestation_hash),
    evaluatedAt: new Date(String(row.evaluated_at)).getTime(),
    observationHash: String(row.observation_hash),
  };
}

export class SqlDeploymentAdmissionObservationStore implements DeploymentAdmissionObservationStore {
  private sqlPromise: Promise<SqlLikeAdmissionObservationStore> | null = null;
  private sql(): Promise<SqlLikeAdmissionObservationStore> {
    this.sqlPromise ??= import('../../lib/db.ts').then(({ getSql }) => getSql());
    return this.sqlPromise;
  }

  async append(observation: DeploymentAdmissionObservation): Promise<DeploymentAdmissionObservation> {
    const sql = await this.sql();
    const rows = await sql.query<Record<string, unknown>>(
      `insert into trading_deployment_admission_observations
        (observation_id,request_id,deployment_id,app_version,allowed,reasons,binding_id,binding_hash,attestation_hash,evaluated_at,observation_hash)
       values ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,to_timestamp($10/1000.0),$11)
       returning *`,
      [
        observation.observationId,
        observation.requestId,
        observation.deploymentId,
        observation.appVersion,
        observation.allowed,
        JSON.stringify(observation.reasons),
        observation.bindingId ?? null,
        observation.bindingHash ?? null,
        observation.attestationHash,
        observation.evaluatedAt,
        observation.observationHash,
      ],
    );
    if (!rows[0]) throw new Error('deployment_admission_observation_append_failed');
    return rowToObservation(rows[0]);
  }

  async list(deploymentId?: string): Promise<DeploymentAdmissionObservation[]> {
    const sql = await this.sql();
    const rows = await sql.query<Record<string, unknown>>(
      deploymentId
        ? 'select * from trading_deployment_admission_observations where deployment_id=$1 order by evaluated_at asc'
        : 'select * from trading_deployment_admission_observations order by evaluated_at asc',
      deploymentId ? [deploymentId] : [],
    );
    return rows.map(rowToObservation);
  }
}

export class InMemoryDeploymentAdmissionObservationStore implements DeploymentAdmissionObservationStore {
  private readonly rows: DeploymentAdmissionObservation[] = [];

  async append(observation: DeploymentAdmissionObservation): Promise<DeploymentAdmissionObservation> {
    if (this.rows.some((row) => row.observationId === observation.observationId)) {
      throw new Error('deployment_admission_observation_duplicate');
    }
    this.rows.push({ ...observation, reasons: [...observation.reasons] });
    return { ...observation, reasons: [...observation.reasons] };
  }

  async list(deploymentId?: string): Promise<DeploymentAdmissionObservation[]> {
    return this.rows
      .filter((row) => deploymentId == null || row.deploymentId === deploymentId)
      .map((row) => ({ ...row, reasons: [...row.reasons] }));
  }
}

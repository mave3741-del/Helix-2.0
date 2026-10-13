import type { DeploymentAttestationPayload } from '../../trading/deployment-attestation.ts';
import { hashDeploymentAttestationPayload, type DeploymentReviewBinding, type DeploymentReviewBindingStore } from './deployment-review-binding.ts';

export interface DeploymentAdmissionRequest {
  deploymentId: string;
  appVersion: string;
  attestation: DeploymentAttestationPayload;
  now?: number;
}

export interface DeploymentAdmissionResult {
  allowed: boolean;
  binding: DeploymentReviewBinding;
  reasons: string[];
}

function normalize(value: string): string {
  return value.trim();
}

/**
 * Runtime admission gate for certified worker/deployment startup.
 *
 * It deliberately requires all three independent facts to line up:
 * 1. persisted reviewer decision/binding;
 * 2. current deployment identity/version;
 * 3. externally verified deployment attestation payload.
 *
 * The gate never grants admission and then reports a warning: any mismatch is
 * a hard block so the caller can fail closed before starting workers.
 */
export class DeploymentAdmissionGate {
  private readonly store: DeploymentReviewBindingStore;

  constructor(store: DeploymentReviewBindingStore) {
    this.store = store;
  }

  async evaluate(input: DeploymentAdmissionRequest): Promise<DeploymentAdmissionResult> {
    const now = input.now ?? Date.now();
    const deploymentId = normalize(input.deploymentId);
    const appVersion = normalize(input.appVersion);
    const bindings = await this.store.list();
    const binding = bindings
      .filter((candidate) => candidate.deploymentId === deploymentId && candidate.appVersion === appVersion)
      .sort((a, b) => b.createdAt - a.createdAt)[0];

    if (!binding) {
      return { allowed: false, binding: undefined as never, reasons: ['deployment_review_binding_missing'] };
    }

    const reasons: string[] = [];
    if (binding.decisionAction !== 'deploy') reasons.push('deployment_review_not_deploy_approved');
    if (binding.reviewer.trim() === binding.implementer.trim()) reasons.push('reviewer_implementer_conflict');
    if (binding.expiresAt <= now) reasons.push('deployment_review_binding_expired');
    if (input.attestation.schemaVersion !== 1) reasons.push('deployment_attestation_schema_invalid');
    if (input.attestation.deploymentId !== deploymentId) reasons.push('deployment_attestation_deployment_id_mismatch');
    if (input.attestation.appVersion !== appVersion) reasons.push('deployment_attestation_app_version_mismatch');
    if (input.attestation.expiresAt <= now) reasons.push('deployment_attestation_expired');
    if (input.attestation.expiresAt > binding.expiresAt) reasons.push('deployment_attestation_outlives_binding');
    if (!input.attestation.workerIsolationEnforced) reasons.push('worker_isolation_not_attested');
    if (!input.attestation.networkEgressEnforced) reasons.push('network_egress_not_attested');
    if (!input.attestation.secretsIsolationEnforced) reasons.push('secrets_isolation_not_attested');
    if (!input.attestation.liveExecutionDisabled) reasons.push('live_execution_not_disabled');

    const attestationHash = hashDeploymentAttestationPayload(input.attestation);
    if (attestationHash !== binding.attestationHash) reasons.push('deployment_attestation_hash_mismatch');

    return { allowed: reasons.length === 0, binding, reasons: [...new Set(reasons)].sort() };
  }

  async assertAllowed(input: DeploymentAdmissionRequest): Promise<DeploymentAdmissionResult> {
    const result = await this.evaluate(input);
    if (!result.allowed) throw new Error(`deployment_admission_blocked:${result.reasons.join(',')}`);
    return result;
  }
}

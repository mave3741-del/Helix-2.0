import { createPublicKey, verify as verifySignature } from 'node:crypto';

export interface DeploymentAttestationPayload {
  schemaVersion: 1;
  deploymentId: string;
  issuedAt: number;
  expiresAt: number;
  appVersion: string;
  workerIsolationEnforced: boolean;
  networkEgressEnforced: boolean;
  secretsIsolationEnforced: boolean;
  liveExecutionDisabled: boolean;
}

export interface DeploymentAttestationReport {
  ok: boolean;
  reasons: string[];
  payload?: DeploymentAttestationPayload;
}

function canonicalPayload(payload: DeploymentAttestationPayload): string {
  return JSON.stringify({
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

function decodeBase64Url(value: string): Buffer {
  return Buffer.from(value.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

/**
 * Verify an externally-issued deployment attestation.
 * The signer is expected to live outside the application runtime so the app
 * cannot mint its own production-isolation proof.
 * Token format: base64url(JSON payload).base64url(ed25519 signature)
 */
export function verifyDeploymentAttestation(
  token: string | undefined,
  publicKeyPem: string | undefined,
  now = Date.now(),
): DeploymentAttestationReport {
  const reasons: string[] = [];
  if (!token) reasons.push('deployment_attestation_missing');
  if (!publicKeyPem) reasons.push('deployment_attestation_public_key_missing');
  if (!token || reasons.length) return { ok: false, reasons };

  const parts = token.split('.');
  if (parts.length !== 2) return { ok: false, reasons: ['deployment_attestation_format_invalid'] };
  let payload: DeploymentAttestationPayload;
  try {
    payload = JSON.parse(decodeBase64Url(parts[0]).toString('utf8')) as DeploymentAttestationPayload;
  } catch {
    return { ok: false, reasons: ['deployment_attestation_payload_invalid'] };
  }

  if (payload.schemaVersion !== 1) reasons.push('deployment_attestation_schema_invalid');
  if (!payload.deploymentId) reasons.push('deployment_attestation_deployment_id_missing');
  if (!payload.appVersion) reasons.push('deployment_attestation_app_version_missing');
  if (!Number.isFinite(payload.issuedAt) || !Number.isFinite(payload.expiresAt)) reasons.push('deployment_attestation_time_invalid');
  if (payload.expiresAt <= payload.issuedAt) reasons.push('deployment_attestation_expiry_invalid');
  if (now < payload.issuedAt - 60_000) reasons.push('deployment_attestation_not_yet_valid');
  if (now > payload.expiresAt) reasons.push('deployment_attestation_expired');
  if (!payload.workerIsolationEnforced) reasons.push('worker_isolation_not_attested');
  if (!payload.networkEgressEnforced) reasons.push('network_egress_not_attested');
  if (!payload.secretsIsolationEnforced) reasons.push('secrets_isolation_not_attested');
  if (!payload.liveExecutionDisabled) reasons.push('live_execution_not_disabled');

  try {
    const publicKey = createPublicKey(publicKeyPem!);
    const verified = verifySignature(
      null,
      Buffer.from(canonicalPayload(payload)),
      publicKey,
      decodeBase64Url(parts[1]),
    );
    if (!verified) reasons.push('deployment_attestation_signature_invalid');
  } catch {
    reasons.push('deployment_attestation_signature_verification_failed');
  }

  return reasons.length ? { ok: false, reasons, payload } : { ok: true, reasons: [], payload };
}

export function currentDeploymentAttestation(): DeploymentAttestationReport {
  return verifyDeploymentAttestation(
    process.env.HELIX_DEPLOYMENT_ATTESTATION,
    process.env.HELIX_DEPLOYMENT_ATTESTATION_PUBLIC_KEY,
  );
}

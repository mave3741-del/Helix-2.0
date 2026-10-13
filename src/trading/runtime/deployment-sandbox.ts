import { createHash } from 'node:crypto';

export interface DeploymentSandboxAttestation {
  enforced: boolean;
  networkPolicy: 'deny' | 'allowlist' | 'unknown';
  filesystemIsolation: boolean;
  rawKeyAccessDenied: boolean;
  privilegeRestricted: boolean;
  reasons: string[];
  attestationHash: string;
}

function sha256Hex(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export function attestDeploymentSandbox(env: Record<string, string | undefined> = process.env): DeploymentSandboxAttestation {
  const enforced = env.HELIX_DEPLOYMENT_SANDBOX === 'container';
  const networkPolicy: DeploymentSandboxAttestation['networkPolicy'] =
    env.HELIX_NETWORK_POLICY === 'deny' || env.HELIX_NETWORK_POLICY === 'allowlist' ? env.HELIX_NETWORK_POLICY : 'unknown';
  const filesystemIsolation = env.HELIX_FILESYSTEM_POLICY === 'isolated';
  const rawKeyAccessDenied = env.HELIX_RAW_KEYS_DENIED === 'true';
  const privilegeRestricted = env.HELIX_PRIVILEGE_RESTRICTED === 'true';
  const reasons: string[] = [];
  if (!enforced) reasons.push('deployment_sandbox_not_attested');
  if (networkPolicy === 'unknown') reasons.push('deployment_network_policy_unknown');
  if (!filesystemIsolation) reasons.push('deployment_filesystem_isolation_missing');
  if (!rawKeyAccessDenied) reasons.push('deployment_raw_key_access_not_denied');
  if (!privilegeRestricted) reasons.push('deployment_privilege_restriction_missing');
  const payload = { enforced, networkPolicy, filesystemIsolation, rawKeyAccessDenied, privilegeRestricted, reasons: [...reasons].sort() };
  return { ...payload, attestationHash: sha256Hex(payload) };
}

export function deploymentSandboxPasses(attestation: DeploymentSandboxAttestation): boolean {
  return attestation.enforced && attestation.networkPolicy !== 'unknown' && attestation.filesystemIsolation && attestation.rawKeyAccessDenied && attestation.privilegeRestricted;
}

import { attestDeploymentSandbox, deploymentSandboxPasses, type DeploymentSandboxAttestation } from './deployment-sandbox.ts';

export interface DeploymentSandboxRequirements {
  requireContainer: boolean;
  requireNetworkDenyOrAllowlist: boolean;
  requireFilesystemIsolation: boolean;
  requireRawKeyDenial: boolean;
  requirePrivilegeRestriction: boolean;
}

export const STRICT_DEPLOYMENT_SANDBOX_REQUIREMENTS: DeploymentSandboxRequirements = {
  requireContainer: true,
  requireNetworkDenyOrAllowlist: true,
  requireFilesystemIsolation: true,
  requireRawKeyDenial: true,
  requirePrivilegeRestriction: true,
};

export function evaluateDeploymentSandbox(
  env: Record<string, string | undefined> = process.env,
  requirements: DeploymentSandboxRequirements = STRICT_DEPLOYMENT_SANDBOX_REQUIREMENTS,
): DeploymentSandboxAttestation & { ready: boolean } {
  const attestation = attestDeploymentSandbox(env);
  const reasons = [...attestation.reasons];
  if (requirements.requireContainer && !attestation.enforced && !reasons.includes('deployment_sandbox_not_attested')) reasons.push('deployment_sandbox_not_attested');
  if (requirements.requireNetworkDenyOrAllowlist && attestation.networkPolicy === 'unknown' && !reasons.includes('deployment_network_policy_unknown')) reasons.push('deployment_network_policy_unknown');
  if (requirements.requireFilesystemIsolation && !attestation.filesystemIsolation && !reasons.includes('deployment_filesystem_isolation_missing')) reasons.push('deployment_filesystem_isolation_missing');
  if (requirements.requireRawKeyDenial && !attestation.rawKeyAccessDenied && !reasons.includes('deployment_raw_key_access_not_denied')) reasons.push('deployment_raw_key_access_not_denied');
  if (requirements.requirePrivilegeRestriction && !attestation.privilegeRestricted && !reasons.includes('deployment_privilege_restriction_missing')) reasons.push('deployment_privilege_restriction_missing');
  const ready = deploymentSandboxPasses(attestation) && reasons.length === 0;
  return { ...attestation, reasons: reasons.sort(), ready };
}

export function assertDeploymentSandboxReady(env: Record<string, string | undefined> = process.env): void {
  const result = evaluateDeploymentSandbox(env);
  if (!result.ready) throw new Error(`deployment_sandbox_not_ready:${result.reasons.join(',')}`);
}

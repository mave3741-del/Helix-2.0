import type { ConnectorReadinessResult } from '../data/connector-readiness.ts';
import type { DeploymentSandboxAttestation } from '../runtime/deployment-sandbox.ts';
import { deploymentSandboxPasses } from '../runtime/deployment-sandbox.ts';
import type { PaperObservationResult } from '../observation/paper-observation.ts';

export interface Phase4AdmissionInput {
  ciVerified: boolean;
  migrationIntegrityVerified: boolean;
  connectorReadiness: ConnectorReadinessResult[];
  deploymentSandbox: DeploymentSandboxAttestation;
  paperObservation: PaperObservationResult;
  liveExecutionEnabled?: boolean;
}

export interface Phase4AdmissionResult {
  status: 'qualified' | 'blocked';
  reasons: string[];
}

export function evaluatePhase4Admission(input: Phase4AdmissionInput): Phase4AdmissionResult {
  const reasons: string[] = [];
  if (!input.ciVerified) reasons.push('phase4_ci_not_verified');
  if (!input.migrationIntegrityVerified) reasons.push('phase4_migration_integrity_not_verified');
  if (!input.connectorReadiness.length) reasons.push('phase4_connector_set_empty');
  else if (input.connectorReadiness.some((r) => r.status !== 'ready')) reasons.push('phase4_connector_readiness_blocked');
  if (!deploymentSandboxPasses(input.deploymentSandbox)) reasons.push('phase4_deployment_sandbox_blocked');
  if (input.paperObservation.status !== 'qualified') reasons.push('phase4_paper_observation_not_qualified');
  if (input.liveExecutionEnabled === true) reasons.push('phase4_live_execution_must_remain_disabled');
  return { status: reasons.length ? 'blocked' : 'qualified', reasons: [...new Set(reasons)] };
}

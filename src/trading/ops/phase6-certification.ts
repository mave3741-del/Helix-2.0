export type GateStatus = 'pass' | 'fail' | 'pending';

export interface Phase6Gate {
  id: string;
  status: GateStatus;
  evidence: string;
}

export interface Phase6CertificationSnapshot {
  packageVersion: string;
  lockfileVersion: number;
  nodeMajor: number;
  npmMajor: number;
  liveExecutionEnabled: boolean;
  gates: readonly Phase6Gate[];
}

export interface Phase6CertificationResult {
  status: 'CERTIFIED_FOR_EXTERNAL_STAGING' | 'BLOCKED';
  reasons: string[];
}

export function evaluatePhase6Certification(snapshot: Phase6CertificationSnapshot): Phase6CertificationResult {
  const reasons: string[] = [];
  if (snapshot.liveExecutionEnabled) reasons.push('live execution must remain disabled');
  if (snapshot.packageVersion.trim() === '') reasons.push('package version missing');
  if (snapshot.nodeMajor < 22) reasons.push('Node 22+ is required');
  if (snapshot.npmMajor < 10) reasons.push('npm 10+ is required');

  for (const gate of snapshot.gates) {
    if (gate.status !== 'pass') reasons.push(`${gate.id}:${gate.status}`);
  }

  return reasons.length === 0
    ? { status: 'CERTIFIED_FOR_EXTERNAL_STAGING', reasons: [] }
    : { status: 'BLOCKED', reasons };
}

#!/usr/bin/env node
import { createPublicKey, verify as verifySignature } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const token = process.env.HELIX_DEPLOYMENT_ATTESTATION ?? '';
const publicKeyPem = process.env.HELIX_DEPLOYMENT_ATTESTATION_PUBLIC_KEY ?? '';
const reasons = [];
function decodeBase64Url(value) { return Buffer.from(value.replace(/-/g, '+').replace(/_/g, '/'), 'base64'); }
if (!token) reasons.push('deployment_attestation_missing');
if (!publicKeyPem) reasons.push('deployment_attestation_public_key_missing');
let payload;
if (!reasons.length) {
  const parts = token.split('.');
  if (parts.length !== 2) reasons.push('deployment_attestation_format_invalid');
  else {
    try { payload = JSON.parse(decodeBase64Url(parts[0]).toString('utf8')); } catch { reasons.push('deployment_attestation_payload_invalid'); }
    if (payload) {
      if (payload.schemaVersion !== 1) reasons.push('deployment_attestation_schema_invalid');
      if (!payload.deploymentId) reasons.push('deployment_attestation_deployment_id_missing');
      if (!payload.appVersion) reasons.push('deployment_attestation_app_version_missing');
      if (!Number.isFinite(payload.issuedAt) || !Number.isFinite(payload.expiresAt)) reasons.push('deployment_attestation_time_invalid');
      if (payload.expiresAt <= payload.issuedAt) reasons.push('deployment_attestation_expiry_invalid');
      const now = Date.now();
      if (now < payload.issuedAt - 60_000) reasons.push('deployment_attestation_not_yet_valid');
      if (now > payload.expiresAt) reasons.push('deployment_attestation_expired');
      if (!payload.workerIsolationEnforced) reasons.push('worker_isolation_not_attested');
      if (!payload.networkEgressEnforced) reasons.push('network_egress_not_attested');
      if (!payload.secretsIsolationEnforced) reasons.push('secrets_isolation_not_attested');
      if (!payload.liveExecutionDisabled) reasons.push('live_execution_not_disabled');
      try {
        const publicKey = createPublicKey(publicKeyPem);
        const canonical = JSON.stringify({ schemaVersion: payload.schemaVersion, deploymentId: payload.deploymentId, issuedAt: payload.issuedAt, expiresAt: payload.expiresAt, appVersion: payload.appVersion, workerIsolationEnforced: payload.workerIsolationEnforced, networkEgressEnforced: payload.networkEgressEnforced, secretsIsolationEnforced: payload.secretsIsolationEnforced, liveExecutionDisabled: payload.liveExecutionDisabled });
        if (!verifySignature(null, Buffer.from(canonical), publicKey, decodeBase64Url(token.split('.')[1]))) reasons.push('deployment_attestation_signature_invalid');
      } catch { reasons.push('deployment_attestation_signature_verification_failed'); }
    }
  }
}
const report = { schema: 1, gate: 'phase8.8-deployment-attestation', status: reasons.length ? 'BLOCKED' : 'PASS', reasons: [...new Set(reasons)].sort(), payload: payload ? { deploymentId: payload.deploymentId, appVersion: payload.appVersion, issuedAt: payload.issuedAt, expiresAt: payload.expiresAt } : undefined };
mkdirSync(join(process.cwd(), 'artifacts'), { recursive: true });
writeFileSync(join(process.cwd(), 'artifacts', 'deployment-attestation-verification.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
process.exitCode = report.status === 'PASS' ? 0 : 1;

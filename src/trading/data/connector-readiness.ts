import { assertPublicHttpEndpoint } from './adapters.ts';

export type ConnectorDataClass = 'market-data' | 'fundamental' | 'sentiment' | 'smart-money';
export type ConnectorReadinessStatus = 'ready' | 'blocked';

export interface ConnectorReadinessInput {
  id: string;
  dataClass: ConnectorDataClass;
  endpoint?: string;
  allowlistedHost?: boolean;
  credentialsConfigured: boolean;
  readOnly: boolean;
  pointInTimeSafe: boolean;
  rateLimitConfigured: boolean;
  licensingReviewed: boolean;
  provenanceReviewed: boolean;
  timeoutMs?: number;
  maxResponseBytes?: number;
}

export interface ConnectorReadinessResult {
  id: string;
  status: ConnectorReadinessStatus;
  reasons: string[];
  decisionHash: string;
}

async function sha256(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

export async function evaluateConnectorReadiness(input: ConnectorReadinessInput): Promise<ConnectorReadinessResult> {
  if (!input.id.trim()) throw new Error('connector_id_required');
  const reasons: string[] = [];
  if (!input.endpoint) reasons.push('connector_endpoint_missing');
  else {
    try { assertPublicHttpEndpoint(input.endpoint); } catch { reasons.push('connector_endpoint_invalid'); }
    if (input.allowlistedHost !== true) reasons.push('connector_endpoint_not_allowlisted');
  }
  if (!input.credentialsConfigured) reasons.push('connector_credentials_missing');
  if (!input.readOnly) reasons.push('connector_not_read_only');
  if (!input.pointInTimeSafe) reasons.push('connector_not_pit_safe');
  if (!input.rateLimitConfigured) reasons.push('connector_rate_limit_not_configured');
  if (!input.licensingReviewed) reasons.push('connector_licensing_not_reviewed');
  if (!input.provenanceReviewed) reasons.push('connector_provenance_not_reviewed');
  if (!Number.isFinite(input.timeoutMs) || (input.timeoutMs ?? 0) < 250 || (input.timeoutMs ?? 0) > 120_000) reasons.push('connector_timeout_invalid');
  if (!Number.isFinite(input.maxResponseBytes) || (input.maxResponseBytes ?? 0) < 1_024 || (input.maxResponseBytes ?? 0) > 10_000_000) reasons.push('connector_response_limit_invalid');
  const status = reasons.length ? 'blocked' : 'ready';
  return { id: input.id, status, reasons, decisionHash: await sha256({ id: input.id, status, reasons: [...reasons].sort() }) };
}

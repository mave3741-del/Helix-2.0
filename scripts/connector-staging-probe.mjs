#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';


function assertPublicHttpEndpoint(endpoint) {
  const u = new URL(endpoint);
  const host = u.hostname.toLowerCase().replace(/[[\]]/g, '');
  const privateHost = host === 'localhost' || host.endsWith('.localhost') || host === '0.0.0.0' || host === '::1'
    || /^127\.(?:\d{1,3}\.){2}\d{1,3}$/.test(host)
    || /^10\.(?:\d{1,3}\.){2}\d{1,3}$/.test(host)
    || /^192\.168\.(?:\d{1,3}\.)\d{1,3}$/.test(host)
    || (() => { const m = host.match(/^172\.(\d{1,3})\./); return !!m && Number(m[1]) >= 16 && Number(m[1]) <= 31; })()
    || /^169\.254\.(?:\d{1,3}\.)\d{1,3}$/.test(host)
    || host.endsWith('.local') || host.endsWith('.internal') || host.endsWith('.lan');
  if (!/^https?:$/.test(u.protocol)) throw new Error('adapter endpoint must use http(s)');
  if (u.username || u.password) throw new Error('adapter endpoint must not embed credentials');
  if (privateHost) throw new Error('adapter endpoint must not target private or local destinations');
}

const url = process.env.HELIX_CONNECTOR_PROBE_URL?.trim() ?? '';
const allowlisted = process.env.HELIX_CONNECTOR_PROBE_ALLOWLISTED === 'true';
const timeoutMs = Number(process.env.HELIX_CONNECTOR_PROBE_TIMEOUT_MS ?? 10_000);
const maxBytes = Number(process.env.HELIX_CONNECTOR_PROBE_MAX_BYTES ?? 2_000_000);
const bearer = process.env.HELIX_CONNECTOR_PROBE_BEARER_TOKEN?.trim() ?? '';

const reasons = [];
if (!url) reasons.push('connector_probe_url_required');
if (!allowlisted) reasons.push('connector_probe_allowlisted_required');
if (!Number.isFinite(timeoutMs) || timeoutMs < 250 || timeoutMs > 120_000) reasons.push('connector_probe_timeout_invalid');
if (!Number.isFinite(maxBytes) || maxBytes < 1_024 || maxBytes > 10_000_000) reasons.push('connector_probe_response_limit_invalid');
if (url) {
  try { assertPublicHttpEndpoint(url); } catch { reasons.push('connector_probe_endpoint_invalid'); }
}

const report = {
  schema: 1,
  gate: 'phase8.8-connector-staging-probe',
  endpointConfigured: Boolean(url),
  allowlisted,
  timeoutMs,
  maxBytes,
  bearerConfigured: Boolean(bearer),
  reasons: [...new Set(reasons)].sort(),
  status: 'BLOCKED',
};

if (report.reasons.length === 0) {
  const started = performance.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'error',
      signal: controller.signal,
      headers: {
        accept: 'application/json,text/plain;q=0.9,*/*;q=0.8',
        ...(bearer ? { authorization: `Bearer ${bearer}` } : {}),
      },
    });
    const contentLength = Number(response.headers.get('content-length') ?? '');
    if (Number.isFinite(contentLength) && contentLength > maxBytes) throw new Error('response_too_large');
    const body = await response.arrayBuffer();
    if (body.byteLength > maxBytes) throw new Error('response_too_large');
    report.status = response.ok ? 'PASS' : 'FAIL';
    report.httpStatus = response.status;
    report.contentType = response.headers.get('content-type') ?? 'unknown';
    report.responseBytes = body.byteLength;
    report.latencyMs = Math.round(performance.now() - started);
  } catch (error) {
    report.status = 'FAIL';
    report.error = error instanceof Error ? error.message : String(error);
    report.latencyMs = Math.round(performance.now() - started);
  } finally {
    clearTimeout(timer);
  }
}

const publicReport = { ...report };
const evidenceHash = createHash('sha256').update(JSON.stringify(publicReport)).digest('hex');
const artifact = { ...publicReport, evidenceHash };
mkdirSync(join(process.cwd(), 'artifacts'), { recursive: true });
writeFileSync(join(process.cwd(), 'artifacts', 'connector-staging-probe.json'), `${JSON.stringify(artifact, null, 2)}\n`);
console.log(JSON.stringify(artifact, null, 2));
process.exitCode = artifact.status === 'PASS' ? 0 : 1;

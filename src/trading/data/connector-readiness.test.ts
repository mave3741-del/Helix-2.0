import assert from 'node:assert/strict';
import { test } from 'node:test';
import { evaluateConnectorReadiness } from './connector-readiness.ts';

test('connector readiness accepts a fully reviewed read-only connector', async () => {
  const result = await evaluateConnectorReadiness({ id:'alpaca-readonly', dataClass:'market-data', endpoint:'https://data.example.com/v2', allowlistedHost:true, credentialsConfigured:true, readOnly:true, pointInTimeSafe:true, rateLimitConfigured:true, licensingReviewed:true, provenanceReviewed:true, timeoutMs:15000, maxResponseBytes:1_000_000 });
  assert.equal(result.status, 'ready');
  assert.deepEqual(result.reasons, []);
  assert.equal(result.decisionHash.length, 64);
});

test('connector readiness fails closed on missing controls', async () => {
  const result = await evaluateConnectorReadiness({ id:'unsafe', dataClass:'market-data', endpoint:'http://localhost:9', allowlistedHost:false, credentialsConfigured:false, readOnly:false, pointInTimeSafe:false, rateLimitConfigured:false, licensingReviewed:false, provenanceReviewed:false, timeoutMs:1, maxResponseBytes:20 });
  assert.equal(result.status, 'blocked');
  assert.ok(result.reasons.includes('connector_endpoint_not_allowlisted'));
  assert.ok(result.reasons.includes('connector_not_read_only'));

  const missingEndpoint = await evaluateConnectorReadiness({ id:'missing-endpoint', dataClass:'market-data', credentialsConfigured:true, readOnly:true, pointInTimeSafe:true, rateLimitConfigured:true, licensingReviewed:true, provenanceReviewed:true, timeoutMs:15000, maxResponseBytes:1_000_000 });
  assert.equal(missingEndpoint.status, 'blocked');
  assert.ok(missingEndpoint.reasons.includes('connector_endpoint_missing'));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const script = path.resolve('scripts/connector-staging-probe.mjs');

test('connector staging probe is secret-safe and bounded', () => {
  const text = fs.readFileSync(script, 'utf8');
  assert.match(text, /Bearer/);
  assert.match(text, /redirect:\s*['"]error['"]/);
  assert.match(text, /maxBytes/);
  assert.match(text, /responseBytes/);
  assert.doesNotMatch(text, /response\.text\(\)/);
  assert.match(text, /evidenceHash/);
});

test('connector staging probe requires explicit public endpoint and allowlist', () => {
  const text = fs.readFileSync(script, 'utf8');
  assert.match(text, /connector_probe_url_required/);
  assert.match(text, /connector_probe_allowlisted_required/);
  assert.match(text, /connector_probe_endpoint_invalid/);
});

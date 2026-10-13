import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const script = fs.readFileSync('scripts/seal-external-evidence.mjs', 'utf8');

test('sealed evidence bundle requires a PASS certification result', () => {
  assert.match(script, /evidence\.status !== 'PASS'/);
  assert.match(script, /preflight\.status !== 'READY'/);
});

test('sealed evidence bundle rejects credential-shaped keys', () => {
  assert.match(script, /DATABASE_URL/);
  assert.match(script, /privateKey/);
  assert.match(script, /hasForbiddenKey/);
  assert.match(script, /credentialsSerialized: false/);
});

test('sealed evidence bundle creates deterministic file hashes and bundle hash', () => {
  assert.match(script, /sha256Bytes/);
  assert.match(script, /manifest\.bundleHash/);
  assert.match(script, /SEALED\.flag/);
});

test('sealed bundle records the live-trading safety boundary', () => {
  assert.match(script, /liveExecutionDisabled/);
  assert.match(script, /evidence\.environment\?\.liveExecution === false/);
});

import assert from 'node:assert/strict';
import { assertPublicHttpEndpoint } from './adapters.ts';

assert.equal(assertPublicHttpEndpoint('https://example.com/feed').startsWith('https://example.com/'), true);
for (const endpoint of [
  'http://localhost:8080/feed',
  'http://127.0.0.1/feed',
  'http://10.0.0.8/feed',
  'http://172.16.0.10/feed',
  'http://192.168.1.10/feed',
  'http://169.254.1.10/feed',
  'http://service.internal/feed',
  'http://user:pass@example.com/feed',
]) {
  assert.throws(() => assertPublicHttpEndpoint(endpoint));
}
console.log('adapter endpoint security 9/9 PASS');

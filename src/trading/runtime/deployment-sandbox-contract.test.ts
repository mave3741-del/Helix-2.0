import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(new URL('../../../', import.meta.url).pathname);

test('deployment sandbox has a concrete container enforcement manifest', () => {
  const compose = readFileSync(join(root, 'deploy/docker-compose.sandbox.yml'), 'utf8');
  const dockerfile = readFileSync(join(root, 'deploy/worker.Dockerfile'), 'utf8');
  assert.match(compose, /network_mode:\s*["']none["']/);
  assert.match(compose, /read_only:\s*true/);
  assert.match(compose, /no-new-privileges:true/);
  assert.match(compose, /cap_drop:[\s\S]*?-\s*ALL/);
  assert.match(dockerfile, /USER\s+10001:10001/);
  assert.match(dockerfile, /--experimental-permission/);
});

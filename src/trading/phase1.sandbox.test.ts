import test from 'node:test';
import assert from 'node:assert/strict';
import { WorkerSandbox, assertEgressAllowed } from './runtime/worker-sandbox.ts';
import { runNodeFile, writeWorkspaceFile } from '../runtime/tools/sandbox.ts';

test('worker sandbox strips secrets and runs bounded code', async () => {
  const sandbox = new WorkerSandbox({ timeoutMs: 2000, maxOutputBytes: 500, network:'deny', allowedHosts:[], envAllowlist:[] });
  const result = await sandbox.runJavaScript('console.log(process.env.HELIX_MODEL_API_KEY ?? "none"); console.log("ok")');
  assert.equal(result.ok, true);
  assert.equal(result.stdout.includes('HELIX_MODEL_API_KEY'), false);
  assert.ok(result.stdout.includes('ok'));
});

test('worker sandbox fail-closes network egress', () => {
  assert.throws(() => assertEgressAllowed('https://example.com', { timeoutMs:1000, maxOutputBytes:100, network:'deny', allowedHosts:[] }), /sandbox_network_denied/);
  assert.doesNotThrow(() => assertEgressAllowed('https://api.example.com', { timeoutMs:1000, maxOutputBytes:100, network:'allowlist', allowedHosts:['api.example.com'] }));
  assert.throws(() => assertEgressAllowed('https://evil.example.com', { timeoutMs:1000, maxOutputBytes:100, network:'allowlist', allowedHosts:['api.example.com'] }), /sandbox_egress_host_denied/);
});

test('worker sandbox brokers allowlisted network without granting unrestricted child networking', async () => {
  const sandbox = new WorkerSandbox({
    timeoutMs: 2000,
    maxOutputBytes: 1000,
    network: 'allowlist',
    allowedHosts: ['api.example.com'],
    envAllowlist: [],
    fetchImpl: async (_input) => new Response('broker-ok', { status: 200, headers: { 'content-type': 'text/plain' } }),
  });
  const result = await sandbox.runJavaScript('const r=await fetch("https://api.example.com/data"); console.log(r.status); console.log(await r.text())');
  assert.equal(result.ok, true);
  assert.ok(result.stdout.includes('200'));
  assert.ok(result.stdout.includes('broker-ok'));
});

test('worker sandbox rejects non-allowlisted network requests before broker fetch', async () => {
  const sandbox = new WorkerSandbox({
    timeoutMs: 2000,
    maxOutputBytes: 1000,
    network: 'allowlist',
    allowedHosts: ['api.example.com'],
    envAllowlist: [],
    fetchImpl: async () => new Response('should-not-run'),
  });
  const result = await sandbox.runJavaScript('try { await fetch("https://evil.example.com"); } catch (e) { console.log(e.message) }');
  assert.equal(result.ok, true);
  assert.ok(result.stdout.includes('sandbox_egress_host_denied'));
});


test('legacy code.run path uses the permission model and cannot spawn children', async () => {
  await writeWorkspaceFile('phase1-child-escape.mjs', 'try { const cp = await import("node:child_process"); cp.spawnSync(process.execPath, ["-e", "console.log(1)"]); } catch (e) { console.log(e.code ?? e.message); }');
  const result = await runNodeFile('phase1-child-escape.mjs');
  assert.equal(result.ok, true);
  assert.ok(result.stdout.includes('ERR_ACCESS_DENIED'));
});

test('legacy web.fetch path is allowlist-and-redirect fail-closed', async () => {
  const { fetchUrl } = await import('../runtime/tools/sandbox.ts');
  const previous = process.env.HELIX_WEB_FETCH_ALLOWED_HOSTS;
  delete process.env.HELIX_WEB_FETCH_ALLOWED_HOSTS;
  await assert.rejects(() => fetchUrl('https://example.com'), /web_fetch_host_not_allowlisted/);
  if (previous !== undefined) process.env.HELIX_WEB_FETCH_ALLOWED_HOSTS = previous;
});


test('worker sandbox rejects resolved private address policy even for an allowlisted hostname when production fetch is used', () => {
  assert.throws(() => assertEgressAllowed('https://127.0.0.1', { timeoutMs:1000, maxOutputBytes:100, network:'allowlist', allowedHosts:['127.0.0.1'] }), /sandbox_private_host_denied/);
});

test('worker sandbox blocks direct Node networking even when user code imports a builtin dynamically', async () => {
  const sandbox = new WorkerSandbox({ timeoutMs: 3000, maxOutputBytes: 1000, network:'deny', allowedHosts:[], envAllowlist:[] });
  const result = await sandbox.runJavaScript('try { await import("node:net"); console.log("network-escape"); } catch (e) { console.log(e.message) }');
  assert.equal(result.ok, true);
  assert.ok(result.stdout.includes('sandbox_builtin_module_denied'));
  assert.equal(result.stdout.includes('network-escape'), false);
});

test('worker sandbox removes alternate builtin and WebSocket escape paths', async () => {
  const sandbox = new WorkerSandbox({ timeoutMs: 3000, maxOutputBytes: 1000, network:'deny', allowedHosts:[], envAllowlist:[] });
  const result = await sandbox.runJavaScript('console.log(String(process.getBuiltinModule)); console.log(String(process.binding)); console.log(String(WebSocket));');
  assert.equal(result.ok, true);
  assert.ok(result.stdout.includes('undefined'));
});

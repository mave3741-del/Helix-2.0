import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { lookup } from 'node:dns/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export interface WorkerSandboxPolicy {
  timeoutMs: number;
  maxOutputBytes: number;
  network: 'deny' | 'allowlist';
  allowedHosts: string[];
  envAllowlist?: string[];
  maxRequestBytes?: number;
  fetchImpl?: (input: string, init?: RequestInit) => Promise<Response>;
}
export interface WorkerSandboxResult { ok: boolean; code: number; stdout: string; stderr: string; timedOut: boolean; }

const DEFAULT_POLICY: WorkerSandboxPolicy = { timeoutMs: 8_000, maxOutputBytes: 32_000, network: 'deny', allowedHosts: [], maxRequestBytes: 256_000 };

function privateResolvedAddress(address: string): boolean {
  const lower = address.toLowerCase();
  if (lower.startsWith('::ffff:') || lower === '::1' || lower.startsWith('fc') || lower.startsWith('fd') || lower.startsWith('fe80:')) return true;
  const p = address.split('.').map(Number);
  if (p.length !== 4 || p.some((x)=>!Number.isInteger(x))) return false;
  const [a,b] = p;
  return a === 0 || a === 10 || a === 127 || (a===169 && b===254) || (a===172 && b>=16 && b<=31) || (a===192 && b===168) || (a===100 && b>=64 && b<=127) || (a===198 && (b===18 || b===19));
}

async function assertResolvedHostPublic(host: string): Promise<void> {
  const rows = await lookup(host, { all: true });
  if (!rows.length || rows.some((row)=>privateResolvedAddress(row.address))) throw new Error('sandbox_private_address_denied');
}

function hostAllowed(rawUrl: string, policy: WorkerSandboxPolicy): URL {
  const url = new URL(rawUrl);
  if (!['https:', 'http:'].includes(url.protocol)) throw new Error('sandbox_protocol_denied');
  if (url.username || url.password) throw new Error('sandbox_credentials_denied');
  const host = url.hostname.toLowerCase();
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1' || host.endsWith('.localhost') || host.endsWith('.local')) throw new Error('sandbox_private_host_denied');
  if (policy.network !== 'allowlist') throw new Error('sandbox_network_denied');
  const allowed = policy.allowedHosts.map((item) => item.toLowerCase().trim());
  if (!allowed.includes(host)) throw new Error('sandbox_egress_host_denied');
  return url;
}

async function brokerFetch(rawUrl: string, init: { method?: string; headers?: Record<string,string>; body?: string } | undefined, policy: WorkerSandboxPolicy) {
  const url = hostAllowed(rawUrl, policy);
  if (policy.fetchImpl === fetch) await assertResolvedHostPublic(url.hostname);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(250, Math.min(30_000, policy.timeoutMs)));
  try {
    const headers = init?.headers ?? {};
    const body = init?.body;
    if (body && new TextEncoder().encode(body).byteLength > (policy.maxRequestBytes ?? 256_000)) throw new Error('sandbox_request_too_large');
    const response = await (policy.fetchImpl ?? fetch)(url.toString(), { method: init?.method ?? 'GET', headers, body, redirect: 'error', signal: controller.signal });
    const contentLength = Number(response.headers.get('content-length') ?? '0');
    if (contentLength > policy.maxOutputBytes) throw new Error('sandbox_response_too_large');
    const reader = response.body?.getReader();
    if (!reader) return { ok: response.ok, status: response.status, headers: Object.fromEntries(response.headers.entries()), body: await response.text() };
    const chunks: Uint8Array[] = []; let total = 0;
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      total += next.value.byteLength;
      if (total > policy.maxOutputBytes) { await reader.cancel(); throw new Error('sandbox_response_too_large'); }
      chunks.push(next.value);
    }
    const bytes = new Uint8Array(total); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    const text = new TextDecoder().decode(bytes);
    return { ok: response.ok, status: response.status, headers: Object.fromEntries(response.headers.entries()), body: text };
  } finally { clearTimeout(timer); }
}

function runnerSource(source: string): string {
  return `\nconst hostProcess = globalThis.process;\nconst pending = new Map();\nlet seq = 0;\nconst helixFetch = (input, init = {}) => new Promise((resolve, reject) => {\n  const id = ++seq;\n  pending.set(id, { resolve, reject });\n  if (!hostProcess.send) return reject(new Error('sandbox_ipc_unavailable'));\n  hostProcess.send({ type: 'helix-fetch', id, url: typeof input === 'string' ? input : input?.url, init: { method: init.method, headers: init.headers, body: typeof init.body === 'string' ? init.body : undefined } });\n});\nObject.defineProperty(globalThis, 'fetch', { configurable: false, writable: false, value: async (input, init) => {\n  const result = await helixFetch(input, init);\n  return new Response(result.body, { status: result.status, headers: result.headers });\n} });\nhostProcess.on('message', (message) => {\n  if (!message || message.type !== 'helix-fetch-result') return;\n  const entry = pending.get(message.id);\n  if (!entry) return;\n  pending.delete(message.id);\n  if (message.error) entry.reject(new Error(message.error)); else entry.resolve(message);\n});\nconst safeState = { exitCode: 0 };\nconst safeProcess = {\n  env: Object.freeze({ ...hostProcess.env }),\n  argv: Object.freeze([...hostProcess.argv]),\n  platform: hostProcess.platform,\n  version: hostProcess.version,\n  versions: Object.freeze({ ...hostProcess.versions }),\n  cwd: () => hostProcess.cwd(),\n  send: typeof hostProcess.send === 'function' ? hostProcess.send.bind(hostProcess) : undefined,\n  get connected() { return Boolean(hostProcess.connected); },\n  on: (event, handler) => { if (event === 'message') hostProcess.on(event, handler); return safeProcess; },\n  disconnect: () => hostProcess.disconnect?.(),\n  get exitCode() { return safeState.exitCode; },\n  set exitCode(value) { safeState.exitCode = Number(value) || 0; },\n  getBuiltinModule: undefined,\n  binding: undefined,\n};\nObject.defineProperty(globalThis, 'process', { configurable: false, writable: false, value: Object.freeze(safeProcess) });\nObject.defineProperty(globalThis, 'WebSocket', { configurable: false, writable: false, value: undefined });\nObject.defineProperty(globalThis, 'EventSource', { configurable: false, writable: false, value: undefined });\n(async () => {\n  ${source}\n})().then(() => { if (hostProcess.connected) hostProcess.disconnect(); }).catch((error) => { console.error(error?.stack || String(error)); hostProcess.exitCode = 1; if (hostProcess.connected) hostProcess.disconnect(); });\n`;
}

export class WorkerSandbox {
  private readonly policy: WorkerSandboxPolicy;
  constructor(policy: WorkerSandboxPolicy = DEFAULT_POLICY) {
    this.policy = { ...DEFAULT_POLICY, ...policy, allowedHosts: [...policy.allowedHosts] };
    if (this.policy.network === 'allowlist' && this.policy.allowedHosts.length === 0) throw new Error('sandbox_allowlist_required');
  }

  async runJavaScript(source: string, args: string[] = []): Promise<WorkerSandboxResult> {
    if (source.length > 200_000) throw new Error('sandbox_source_too_large');
    const dir = await mkdtemp(join(tmpdir(), 'helix-worker-'));
    const file = join(dir, 'worker.mjs');
    const loader = join(dir, 'loader.mjs');
    const loaderSource = await readFile(join(process.cwd(), 'src/trading/runtime/worker-sandbox-loader.mjs'), 'utf8');
    await writeFile(file, runnerSource(source), 'utf8');
    await writeFile(loader, loaderSource, 'utf8');
    return new Promise((resolve) => {
      const env: Record<string,string> = { PATH: process.env.PATH ?? '', HOME: dir, NODE_ENV: 'sandbox', HELIX_SANDBOX_ROOT: dir };
      for (const key of this.policy.envAllowlist ?? []) if (process.env[key]) env[key] = process.env[key]!;
      const childArgs = ['--permission', '--allow-worker', `--allow-fs-read=${dir}`, `--allow-fs-write=${dir}`, '--experimental-loader', loader, file, ...args];
      const child = spawn(process.execPath, childArgs, { cwd: dir, env, stdio:['ignore','pipe','pipe','ipc'] });
      let stdout='', stderr='', timedOut=false;
      const clip=(text:string) => text.length > this.policy.maxOutputBytes ? text.slice(0,this.policy.maxOutputBytes) : text;
      const timer=setTimeout(()=>{ timedOut=true; child.kill('SIGKILL'); }, Math.max(250, Math.min(60_000,this.policy.timeoutMs)));
      child.stdout?.on('data',(d)=>{ stdout=clip(stdout+String(d)); });
      child.stderr?.on('data',(d)=>{ stderr=clip(stderr+String(d)); });
      child.on('message', async (message: any) => {
        if (!message || message.type !== 'helix-fetch') return;
        try {
          const result = await brokerFetch(String(message.url), message.init, this.policy);
          child.send?.({ type:'helix-fetch-result', id:message.id, ...result });
        } catch (error) {
          child.send?.({ type:'helix-fetch-result', id:message.id, error:error instanceof Error ? error.message : 'sandbox_fetch_failed' });
        }
      });
      child.on('error',async(err)=>{ clearTimeout(timer); await rm(dir,{recursive:true,force:true}); resolve({ok:false,code:1,stdout,stderr:clip(stderr+err.message),timedOut}); });
      child.on('close',async(code)=>{ clearTimeout(timer); await rm(dir,{recursive:true,force:true}); resolve({ok:(code??1)===0 && !timedOut,code:code??1,stdout,stderr,timedOut}); });
    });
  }
}

export function assertEgressAllowed(url: string, policy: WorkerSandboxPolicy): void { hostAllowed(url, policy); }

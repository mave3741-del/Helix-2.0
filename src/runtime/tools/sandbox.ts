import { spawn } from "node:child_process";
import { lookup } from "node:dns/promises";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";

export const WORKSPACE_ROOT = resolve(process.cwd(), ".helix/work");

function assertSafe(rel: string) {
  const cleaned = rel.replace(/^[/\\]+/, "").replace(/\0/g, "");
  if (cleaned.includes("..")) throw new Error("Path escape rejected");
  const full = resolve(WORKSPACE_ROOT, cleaned);
  if (full !== WORKSPACE_ROOT && !full.startsWith(WORKSPACE_ROOT + sep)) {
    throw new Error("Path escape rejected");
  }
  return { rel: cleaned, full };
}

export async function ensureWorkspace() {
  await mkdir(WORKSPACE_ROOT, { recursive: true });
}

export async function listFiles(rel = ".") {
  await ensureWorkspace();
  const { full } = assertSafe(rel || ".");
  const entries = await readdir(full, { withFileTypes: true });
  return entries.map((e) => ({
    name: e.name,
    type: e.isDirectory() ? "dir" : "file",
    path: relative(WORKSPACE_ROOT, join(full, e.name)) || e.name,
  }));
}

export async function readWorkspaceFile(rel: string) {
  await ensureWorkspace();
  const { full } = assertSafe(rel);
  const buf = await readFile(full);
  if (buf.length > 400_000) throw new Error("File too large");
  return buf.toString("utf8");
}

export async function writeWorkspaceFile(rel: string, content: string) {
  await ensureWorkspace();
  if (content.length > 400_000) throw new Error("Write too large");
  const { full } = assertSafe(rel);
  await mkdir(dirname(full), { recursive: true });
  await writeFile(full, content, "utf8");
  return { path: rel, bytes: Buffer.byteLength(content) };
}

export async function runNodeFile(rel: string, timeoutMs = 8000) {
  await ensureWorkspace();
  const { full } = assertSafe(rel);
  if (!existsSync(full)) throw new Error(`Missing ${rel}`);
  return await new Promise<{ ok: boolean; stdout: string; stderr: string; code: number }>((resolveP) => {
    const child = spawn(process.execPath, ["--permission", `--allow-fs-read=${WORKSPACE_ROOT}`, `--allow-fs-write=${WORKSPACE_ROOT}`, full], {
      cwd: WORKSPACE_ROOT,
      env: { PATH: process.env.PATH ?? "", HOME: WORKSPACE_ROOT, NODE_ENV: "test" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const t = setTimeout(() => {
      child.kill("SIGKILL");
    }, timeoutMs);
    child.stdout.on("data", (d) => {
      stdout += String(d);
      if (stdout.length > 20_000) stdout = stdout.slice(0, 20_000);
    });
    child.stderr.on("data", (d) => {
      stderr += String(d);
      if (stderr.length > 20_000) stderr = stderr.slice(0, 20_000);
    });
    child.on("close", (code) => {
      clearTimeout(t);
      resolveP({ ok: (code ?? 1) === 0, stdout, stderr, code: code ?? 1 });
    });
    child.on("error", (err) => {
      clearTimeout(t);
      resolveP({ ok: false, stdout, stderr: err.message, code: 1 });
    });
  });
}

const FIB_SRC = `export function fibonacci(n) {
  if (!Number.isInteger(n) || n < 0) throw new Error("n must be a non-negative integer");
  if (n < 2) return n;
  let a = 0, b = 1;
  for (let i = 2; i <= n; i++) {
    const next = a + b;
    a = b;
    b = next;
  }
  return b;
}

if (import.meta.url === \`file://\${process.argv[1]}\`) {
  const n = Number(process.argv[2] ?? 10);
  console.log(String(fibonacci(n)));
}
`;

const FIB_TEST = `import { fibonacci } from "./fibonacci.mjs";
import assert from "node:assert/strict";

assert.equal(fibonacci(0), 0);
assert.equal(fibonacci(1), 1);
assert.equal(fibonacci(10), 55);
assert.equal(fibonacci(20), 6765);
console.log("fibonacci tests passed");
`;

export async function runFibonacciProject() {
  await writeWorkspaceFile("fibonacci.mjs", FIB_SRC);
  await writeWorkspaceFile("fibonacci.test.mjs", FIB_TEST);
  const result = await runNodeFile("fibonacci.test.mjs");
  return {
    files: ["fibonacci.mjs", "fibonacci.test.mjs"],
    ...result,
    evidence: result.ok ? "code-run-pass" : "code-run-fail",
  };
}

function configuredWebFetchHosts(): string[] {
  return (process.env.HELIX_WEB_FETCH_ALLOWED_HOSTS ?? "").split(",").map((host) => host.trim().toLowerCase()).filter(Boolean);
}

function isPrivateAddress(address: string): boolean {
  if (/^(127\.|10\.|192\.168\.)/.test(address)) return true;
  const m = address.match(/^172\.(\d+)\./);
  if (m && Number(m[1]) >= 16 && Number(m[1]) <= 31) return true;
  if (address === "::1" || address.startsWith("fc") || address.startsWith("fd") || address.startsWith("fe80:")) return true;
  return false;
}

export async function fetchUrl(url: string) {
  let parsed: URL;
  try { parsed = new URL(url); } catch { throw new Error("Invalid URL"); }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error("Only http(s) URLs are allowed");
  if (parsed.username || parsed.password) throw new Error("Credentials in URL rejected");
  const allowed = configuredWebFetchHosts();
  if (!allowed.includes(parsed.hostname.toLowerCase())) throw new Error("web_fetch_host_not_allowlisted");
  const resolved = await lookup(parsed.hostname, { all: true });
  if (resolved.some((entry) => isPrivateAddress(entry.address))) throw new Error("web_fetch_private_address_denied");
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 10_000);
  try {
    const res = await fetch(parsed.toString(), { method: "GET", redirect: "error", signal: ctrl.signal, headers: { "User-Agent": "Helix/2 research-tool" } });
    const text = await res.text();
    if (new TextEncoder().encode(text).byteLength > 100_000) throw new Error("web_fetch_response_too_large");
    return { ok: res.ok, status: res.status, contentType: res.headers.get("content-type") ?? "", body: text.slice(0, 8000) };
  } finally { clearTimeout(t); }
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * "browser" tool — sequential, read-only multi-step page walking (GET
 * requests only, via the same allowlisted/SSRF-protected fetchUrl).
 *
 * This is deliberately NOT full interactive browser automation: no clicking,
 * no form-fills, no JS-rendered content, no login flows. That would need a
 * real headless browser (Playwright) with its own large binary download and
 * a host that can run it — a bigger, separate step. This covers the common
 * "read a few pages in sequence and summarize" case safely, on infrastructure
 * that works on any free host.
 */
export async function browseSteps(urls: string[]) {
  const capped = urls.slice(0, 5);
  const steps: Array<{ url: string; ok: boolean; status?: number; excerpt?: string; error?: string }> = [];
  for (const url of capped) {
    try {
      const page = await fetchUrl(url);
      steps.push({ url, ok: page.ok, status: page.status, excerpt: stripHtml(page.body).slice(0, 1500) });
    } catch (e) {
      steps.push({ url, ok: false, error: e instanceof Error ? e.message : "fetch failed" });
    }
  }
  return steps;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * "email.send" tool — outbound mail via Resend. The caller (server.ts)
 * resolves the API key from the credential vault and passes it in; this
 * function never reads secrets itself. Every call still requires an
 * explicit owner approval upstream — this only performs the send once
 * that's been granted, it never grants it.
 */
export async function sendEmail(input: { apiKey: string; from: string; to: string; subject: string; text: string }) {
  if (!EMAIL_RE.test(input.to)) throw new Error("Invalid recipient address");
  if (!input.subject.trim()) throw new Error("Subject required");
  if (input.text.length > 20_000) throw new Error("Message too long");
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 10_000);
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      signal: ctrl.signal,
      headers: { Authorization: `Bearer ${input.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ from: input.from, to: [input.to], subject: input.subject, text: input.text }),
    });
    const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
    if (!res.ok) throw new Error(body.message || `Resend error ${res.status}`);
    return { id: body.id ?? "sent" };
  } finally {
    clearTimeout(t);
  }
}

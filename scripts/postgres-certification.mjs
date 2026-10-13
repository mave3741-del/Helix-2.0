#!/usr/bin/env node
/**
 * Focused real-PostgreSQL verification gate.
 *
 * This is intentionally narrower than the full external-certification gate:
 * it proves only the database boundary once a real DATABASE_URL is supplied.
 * No credential is written to the evidence report or printed to stdout/stderr.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const root = process.cwd();
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const databaseUrl = process.env.DATABASE_URL?.trim() ?? '';

function redactUrl(raw) {
  try {
    const parsed = new URL(raw);
    if (parsed.password) parsed.password = '[REDACTED]';
    if (parsed.username) parsed.username = '[REDACTED]';
    return parsed.toString();
  } catch {
    return raw ? '[CONFIGURED_NON_STANDARD_URL]' : null;
  }
}

function runNpm(script) {
  const executable = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  try {
    const output = execFileSync(executable, ['run', script], {
      cwd: root,
      env: process.env,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 12 * 1024 * 1024,
    });
    return { name: script, status: 'PASS', output: output.trim().slice(-5000) };
  } catch (error) {
    const stdout = String(error?.stdout ?? '').trim();
    const stderr = String(error?.stderr ?? '').trim();
    return {
      name: script,
      status: 'FAIL',
      exitCode: typeof error?.status === 'number' ? error.status : 1,
      output: `${stdout}\n${stderr}`.trim().slice(-5000),
    };
  }
}

const report = {
  schemaVersion: 1,
  gate: 'phase9.10-real-postgresql-verification',
  packageVersion: pkg.version,
  generatedAt: new Date().toISOString(),
  database: {
    configured: Boolean(databaseUrl),
    safeTarget: redactUrl(databaseUrl),
    passwordExposed: false,
    rawConnectionStringExposed: false,
  },
  prerequisites: {
    status: databaseUrl ? 'READY' : 'BLOCKED',
    reasons: databaseUrl ? [] : ['DATABASE_URL_required'],
  },
  execution: [],
};

if (databaseUrl) {
  const steps = ['db:migrate', 'db:verify', 'db-immutability'];
  for (const step of steps) {
    const result = step === 'db-immutability'
      ? (() => {
          try {
            const output = execFileSync(
              process.platform === 'win32' ? 'node.exe' : 'node',
              ['scripts/db-immutability-verify.mjs'],
              { cwd: root, env: process.env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 8 * 1024 * 1024 },
            );
            return { name: step, status: 'PASS', output: output.trim().slice(-5000) };
          } catch (error) {
            return {
              name: step,
              status: 'FAIL',
              exitCode: typeof error?.status === 'number' ? error.status : 1,
              output: `${String(error?.stdout ?? '')}\n${String(error?.stderr ?? '')}`.trim().slice(-5000),
            };
          }
        })()
      : runNpm(step);
    report.execution.push(result);
    if (result.status !== 'PASS') break;
  }
}

const failed = report.execution.find((step) => step.status !== 'PASS');
report.status = report.prerequisites.status === 'BLOCKED'
  ? 'BLOCKED'
  : failed
    ? 'FAIL'
    : 'PASS';
report.evidenceHash = createHash('sha256')
  .update(JSON.stringify({
    gate: report.gate,
    packageVersion: report.packageVersion,
    database: { configured: report.database.configured, safeTarget: report.database.safeTarget },
    prerequisites: report.prerequisites,
    execution: report.execution,
  }))
  .digest('hex');

const artifactDir = path.join(root, 'artifacts');
fs.mkdirSync(artifactDir, { recursive: true });
fs.writeFileSync(path.join(artifactDir, 'postgres-certification-evidence.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
process.exitCode = report.status === 'PASS' ? 0 : 1;

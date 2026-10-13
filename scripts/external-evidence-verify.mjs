#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createHash } from 'node:crypto';

const root = process.cwd();
const inputArg = process.argv.slice(2).find((arg) => arg.startsWith('--input='));
const inputPath = inputArg ? inputArg.slice('--input='.length) : path.join(root, 'artifacts', 'external-certification-evidence.json');
const expectedSchema = 2;
const requiredGate = 'phase8.1-external-certification';
const forbiddenKeys = new Set([
  'DATABASE_URL', 'databaseUrl', 'reviewerId', 'implementerId', 'password', 'token',
  'secret', 'apiKey', 'privateKey', 'accessToken', 'refreshToken'
]);

function sha256(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
function hasForbiddenKey(value, seen = new Set()) {
  if (!value || typeof value !== 'object') return false;
  if (seen.has(value)) return false;
  seen.add(value);
  if (Array.isArray(value)) return value.some((item) => hasForbiddenKey(item, seen));
  return Object.entries(value).some(([key, nested]) => forbiddenKeys.has(key) || hasForbiddenKey(nested, seen));
}
function fail(reason, extra = {}) {
  const report = { schema: 1, gate: 'phase8.4-external-evidence-verifier', status: 'FAIL', reason, ...extra };
  console.error(JSON.stringify(report, null, 2));
  process.exitCode = 1;
}

if (!fs.existsSync(inputPath)) {
  fail('evidence_file_missing', { input: inputPath });
} else {
  let report;
  try {
    report = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  } catch (error) {
    fail('evidence_file_invalid_json', { message: String(error?.message ?? error) });
  }
  if (report) {
    const checks = [];
    checks.push(['schema', report.schema === expectedSchema]);
    checks.push(['gate', report.gate === requiredGate]);
    checks.push(['packageVersion', typeof report.packageVersion === 'string' && report.packageVersion.length > 0]);
    checks.push(['prerequisites', report.prerequisites && typeof report.prerequisites === 'object']);
    checks.push(['execution', Array.isArray(report.execution)]);
    checks.push(['evidenceHash', typeof report.evidenceHash === 'string' && /^[a-f0-9]{64}$/.test(report.evidenceHash)]);
    checks.push(['forbiddenKeysAbsent', !hasForbiddenKey(report)]);

    if (report.prerequisites) {
      checks.push(['prerequisiteReasonsArray', Array.isArray(report.prerequisites.reasons)]);
      checks.push(['prerequisiteStatusValid', ['BLOCKED','READY'].includes(report.prerequisites.status)]);
    }
    if (Array.isArray(report.execution)) {
      checks.push(['executionNamesUnique', new Set(report.execution.map((s) => s?.name)).size === report.execution.length]);
      checks.push(['executionStatusesValid', report.execution.every((s) => ['PASS','FAIL'].includes(s?.status))]);
    }

    const hashPayload = {
      gate: report.gate,
      packageVersion: report.packageVersion,
      environment: report.environment,
      prerequisites: report.prerequisites,
      execution: report.execution?.map(({ name, status, exitCode, output }) => ({ name, status, exitCode, output })) ?? [],
    };
    const recomputed = sha256(hashPayload);
    checks.push(['evidenceHashMatches', recomputed === report.evidenceHash]);

    const failed = checks.filter(([, ok]) => !ok).map(([name]) => name);
    const result = {
      schema: 1,
      gate: 'phase8.4-external-evidence-verifier',
      status: failed.length ? 'FAIL' : 'PASS',
      input: path.relative(root, path.resolve(inputPath)),
      evidenceGate: report.gate,
      packageVersion: report.packageVersion,
      evidenceStatus: report.status ?? null,
      checks: Object.fromEntries(checks),
      failedChecks: failed,
      evidenceHash: report.evidenceHash,
      recomputedEvidenceHash: recomputed,
      replaySafe: failed.length === 0,
    };
    console.log(JSON.stringify(result, null, 2));
    if (failed.length) process.exitCode = 1;
  }
}

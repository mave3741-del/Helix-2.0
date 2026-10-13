import assert from 'node:assert/strict';
import { test } from 'node:test';
import { evaluatePhase6Certification, type Phase6CertificationSnapshot } from './phase6-certification.ts';
import packageJson from '../../../package.json' with { type: 'json' };

const base: Phase6CertificationSnapshot = {
  packageVersion: packageJson.version,
  lockfileVersion: 3,
  nodeMajor: 22,
  npmMajor: 10,
  liveExecutionEnabled: false,
  gates: [
    { id: 'release-integrity', status: 'pass', evidence: 'release integrity passed' },
    { id: 'migration-integrity', status: 'pass', evidence: '27/27' },
    { id: 'typecheck', status: 'pass', evidence: '0 errors' },
    { id: 'lint', status: 'pass', evidence: '0 errors' },
    { id: 'tests', status: 'pass', evidence: '309/309' },
    { id: 'build', status: 'pass', evidence: 'vite + SSR + migrate' },
  ],
};

test('phase 6 certification passes only when all gates pass and live execution is disabled', () => {
  assert.deepEqual(evaluatePhase6Certification(base), {
    status: 'CERTIFIED_FOR_EXTERNAL_STAGING',
    reasons: [],
  });
});

test('phase 6 certification fails closed on pending gates', () => {
  const result = evaluatePhase6Certification({ ...base, gates: [{ ...base.gates[0], status: 'pending' }, ...base.gates.slice(1)] });
  assert.equal(result.status, 'BLOCKED');
  assert.ok(result.reasons.includes('release-integrity:pending'));
});

test('phase 6 certification fails closed if live execution is enabled', () => {
  const result = evaluatePhase6Certification({ ...base, liveExecutionEnabled: true });
  assert.equal(result.status, 'BLOCKED');
  assert.ok(result.reasons.includes('live execution must remain disabled'));
});

test('phase 6 certification requires Node 22 and npm 10', () => {
  const result = evaluatePhase6Certification({ ...base, nodeMajor: 20, npmMajor: 9 });
  assert.equal(result.status, 'BLOCKED');
  assert.ok(result.reasons.includes('Node 22+ is required'));
  assert.ok(result.reasons.includes('npm 10+ is required'));
});

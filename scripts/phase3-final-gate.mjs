import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const root = resolve(new URL('..', import.meta.url).pathname);
const required = [
  'src/trading/phase3-pipeline.ts',
  'src/trading/data/data-quorum.ts',
  'src/trading/ops/watchdog.ts',
  'src/trading/ops/cycle-health.ts',
  'src/trading/ops/operational-health-coordinator.ts',
  'src/trading/champion-portfolio-reconciliation.ts',
  'src/trading/learning/closed-loop.ts',
  'src/trading/learning/closed-loop-scheduler.ts',
  'src/trading/learning/runtime-closed-loop.ts',
  'src/trading/runtime/runtime.ts',
  'migrations/0023_cycle_health_audit.sql',
  'migrations/0024_cycle_health_immutable.sql',
  'migrations/0025_portfolio_governance_runs.sql',
  '.grok/app-env.json',
];

const missing = required.filter((p) => !existsSync(join(root, p)));
if (missing.length) {
  console.error('PHASE3_GATE_FAIL missing=' + missing.join(','));
  process.exit(2);
}

const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const [major, minor, patch] = String(pkg.version).split('.').map(Number);
if (![major, minor, patch].every(Number.isFinite) || major !== 0 || minor < 54) {
  console.error(`PHASE3_GATE_FAIL version=${pkg.version}; expected 0.54.x or newer`);
  process.exit(2);
}

const appEnv = JSON.parse(readFileSync(join(root, '.grok/app-env.json'), 'utf8'));
if (appEnv.VITE_AUTH_ENABLED !== 'false') {
  console.error('PHASE3_GATE_FAIL auth-template-not-off');
  process.exit(2);
}

const migrations = readdirSync(join(root, 'migrations'))
  .filter((f) => /^\d{4}_.+\.sql$/.test(f))
  .sort();
if (migrations.length !== 24) {
  console.error(`PHASE3_GATE_FAIL migration-count=${migrations.length}`);
  process.exit(2);
}

const runtime = readFileSync(join(root, 'src/trading/runtime/runtime.ts'), 'utf8');
if (!runtime.includes('operational_cycle_health_halted')) {
  console.error('PHASE3_GATE_FAIL readiness-admission-gates-missing');
  process.exit(2);
}

const lockEvidence = [
  'live execution remains disabled',
  'live execution disabled',
];
const relevant = readFileSync(join(root, 'docs/WORK_CONTINUITY_LOG.md'), 'utf8').toLowerCase();
if (!lockEvidence.some((needle) => relevant.includes(needle))) {
  console.error('PHASE3_GATE_FAIL live-lock-evidence-missing');
  process.exit(2);
}

try {
  execFileSync(process.execPath, ['scripts/migration-integrity.mjs'], { cwd: root, stdio: 'pipe' });
} catch (error) {
  console.error(error.stdout?.toString() || error.stderr?.toString() || error.message);
  process.exit(error.status || 2);
}

console.log(JSON.stringify({
  phase: 3,
  status: 'engineering-complete',
  release: pkg.version,
  numberedMigrations: migrations.length,
  liveExecution: 'disabled',
  externalStagingPostgres: 'required-before-production',
}, null, 2));

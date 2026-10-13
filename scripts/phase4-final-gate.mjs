import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const results = [];
const add = (name, status, detail='') => results.push({ name, status, detail });

try {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
  add('package_lock_alignment', pkg.version === lock.version && lock.lockfileVersion === 3 ? 'PASS' : 'FAIL', `${pkg.version}/${lock.version}`);
} catch (e) { add('package_lock_alignment','FAIL', String(e)); }

for (const file of [
  'scripts/ci-environment-verify.mjs',
  'scripts/migration-integrity.mjs',
  'scripts/phase4-paper-observation.mjs',
  'src/trading/phase4/phase4-admission.ts',
  'src/trading/data/connector-readiness.ts',
  'src/trading/runtime/deployment-sandbox.ts',
  'src/trading/observation/paper-observation.ts',
]) add(`required_file:${file}`, fs.existsSync(path.join(root,file)) ? 'PASS' : 'FAIL');

const externalPending = [];
if (!process.env.DATABASE_URL) externalPending.push('DATABASE_URL_required_for_real_staging_postgres');
if (process.env.HELIX_STAGING_CONNECTOR_READY !== 'true') externalPending.push('HELIX_STAGING_CONNECTOR_READY=true_required_for_real_connector_staging');
if (process.env.HELIX_DEPLOYMENT_SANDBOX === 'container') {
  if (process.env.HELIX_NETWORK_POLICY === 'unknown' || !process.env.HELIX_NETWORK_POLICY) externalPending.push('deployment_network_policy_attestation');
  if (process.env.HELIX_FILESYSTEM_POLICY !== 'isolated') externalPending.push('deployment_filesystem_isolation_attestation');
  if (process.env.HELIX_RAW_KEYS_DENIED !== 'true') externalPending.push('deployment_raw_key_denial_attestation');
  if (process.env.HELIX_PRIVILEGE_RESTRICTED !== 'true') externalPending.push('deployment_privilege_restriction_attestation');
} else externalPending.push('deployment_container_attestation_required');

add('live_execution_disabled', process.env.HELIX_LIVE_EXECUTION === 'true' ? 'FAIL' : 'PASS');
add('external_staging_evidence', externalPending.length ? 'EXTERNAL_PENDING' : 'PASS', externalPending.join(','));

const hardFailures = results.filter(r => r.status === 'FAIL');
const status = hardFailures.length ? 'FAIL' : externalPending.length ? 'ENGINEERING_COMPLETE_EXTERNAL_PENDING' : 'PASS';
const report = { schema: 1, phase: 4, release: JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')).version, status, results, generatedAt: new Date().toISOString() };
console.log(JSON.stringify(report, null, 2));
process.exitCode = hardFailures.length ? 2 : 0;

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const live = process.env.HELIX_LIVE_EXECUTION === 'true';
const db = Boolean(process.env.DATABASE_URL?.trim());
const external = process.env.HELIX_EXTERNAL_STAGING === 'true';
const reviewer = process.env.HELIX_INDEPENDENT_REVIEWER_ID?.trim();
const implementer = process.env.HELIX_IMPLEMENTER_ID?.trim();
const reasons = [];

if (live) reasons.push('live_execution_forbidden');
if (!fs.existsSync(path.join(root, 'deploy/docker-compose.sandbox.yml'))) reasons.push('sandbox_manifest_missing');
if (!fs.existsSync(path.join(root, 'scripts/db-verify.mjs'))) reasons.push('db_verify_missing');
if (!fs.existsSync(path.join(root, 'scripts/verify-deployment-sandbox.mjs'))) reasons.push('sandbox_probe_missing');
if (!db && external) reasons.push('DATABASE_URL_required_for_external_staging');
if (external && (!reviewer || !implementer || reviewer === implementer)) reasons.push('independent_review_separation_of_duties_missing');

console.log(JSON.stringify({ phase: '6.2-6.8', packageVersion: pkg.version, externalStaging: external, databaseUrlPresent: db, liveExecutionEnabled: live, status: reasons.length ? 'BLOCKED' : 'PASS', reasons }, null, 2));

if (!reasons.length) {
  execFileSync(process.execPath, [path.join(root, 'scripts/verify-deployment-sandbox.mjs')], { stdio: 'inherit' });
}
if (reasons.length) process.exit(1);

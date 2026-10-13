import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname);
const contract = JSON.parse(readFileSync(join(root, 'deploy', 'DEPLOYMENT_SECURITY_CONTRACT.json'), 'utf8'));
const compose = readFileSync(join(root, 'deploy', 'docker-compose.sandbox.yml'), 'utf8');
const dockerfile = readFileSync(join(root, 'deploy', 'worker.Dockerfile'), 'utf8');

const required = [
  ['compose network isolation', /network_mode:\s*["']none["']/],
  ['compose read-only root', /read_only:\s*true/],
  ['compose no-new-privileges', /no-new-privileges:true/],
  ['compose all capabilities dropped', /cap_drop:[\s\S]*?-\s*ALL/],
  ['compose bounded pids', /pids_limit:\s*128/],
  ['dockerfile non-root user', /USER\s+10001:10001/],
  ['dockerfile permission model', /--experimental-permission/],
  ['deployment sandbox env', /HELIX_DEPLOYMENT_SANDBOX:\s*["']container["']/],
  ['network deny env', /HELIX_NETWORK_POLICY:\s*["']deny["']/],
  ['raw keys denied env', /HELIX_RAW_KEYS_DENIED:\s*["']true["']/],
  ['privilege restricted env', /HELIX_PRIVILEGE_RESTRICTED:\s*["']true["']/],
];

const missing = required.filter(([, pattern]) => !pattern.test(`${compose}\n${dockerfile}`));
if (contract.phase5_22_strictSandbox?.required !== true) missing.push(['contract phase5_22_strictSandbox.required', /true/]);
if (missing.length) {
  console.error('deployment_sandbox_contract_failed');
  for (const [label] of missing) console.error(`- ${label}`);
  process.exit(1);
}
console.log(`deployment_sandbox_contract_pass:${required.length}`);

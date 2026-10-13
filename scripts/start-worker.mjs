/**
 * Hardened worker-container entrypoint.
 * The actual task executor is injected by the deployment orchestrator; this
 * process intentionally stays inert until a worker workload is attached.
 */
const required = {
  HELIX_DEPLOYMENT_SANDBOX: 'container',
  HELIX_NETWORK_POLICY: 'deny',
  HELIX_FILESYSTEM_POLICY: 'isolated',
  HELIX_RAW_KEYS_DENIED: 'true',
  HELIX_PRIVILEGE_RESTRICTED: 'true',
};

const failures = Object.entries(required)
  .filter(([key, expected]) => process.env[key] !== expected)
  .map(([key, expected]) => `${key}!=${expected}`);

if (failures.length) {
  console.error(`worker_deployment_contract_failed:${failures.join(',')}`);
  process.exit(1);
}

console.log('helix-worker-sandbox:contract-pass');
setInterval(() => {}, 2 ** 31 - 1);

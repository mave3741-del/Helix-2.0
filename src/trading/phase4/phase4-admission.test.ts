import assert from 'node:assert/strict';
import { evaluatePhase4Admission } from './phase4-admission.ts';

const readyConnector = {
  id: 'market-primary',
  status: 'ready' as const,
  reasons: [],
  decisionHash: 'abc',
};
const sandbox = {
  enforced: true,
  networkPolicy: 'allowlist' as const,
  filesystemIsolation: true,
  rawKeyAccessDenied: true,
  privilegeRestricted: true,
  reasons: [],
  attestationHash: 'att',
};
const observation = {
  status: 'qualified' as const,
  cycleCount: 8,
  totalTrades: 120,
  netPnl: 4.2,
  worstDrawdown: 0.08,
  avgSlippageBps: 3.1,
  observedRegimes: ['trend', 'range', 'high-vol', 'liquidity-stress'],
  reasons: [],
};

const qualified = evaluatePhase4Admission({
  ciVerified: true,
  migrationIntegrityVerified: true,
  connectorReadiness: [readyConnector],
  deploymentSandbox: sandbox,
  paperObservation: observation,
  liveExecutionEnabled: false,
});
assert.equal(qualified.status, 'qualified');
assert.deepEqual(qualified.reasons, []);

const blocked = evaluatePhase4Admission({
  ciVerified: false,
  migrationIntegrityVerified: true,
  connectorReadiness: [{ ...readyConnector, status: 'blocked', reasons: ['missing'] }],
  deploymentSandbox: { ...sandbox, enforced: false },
  paperObservation: { ...observation, status: 'blocked', reasons: ['halted'] },
  liveExecutionEnabled: true,
});
assert.equal(blocked.status, 'blocked');
assert.deepEqual(blocked.reasons, [
  'phase4_ci_not_verified',
  'phase4_connector_readiness_blocked',
  'phase4_deployment_sandbox_blocked',
  'phase4_paper_observation_not_qualified',
  'phase4_live_execution_must_remain_disabled',
]);

console.log('phase4 admission 2/2 PASS');

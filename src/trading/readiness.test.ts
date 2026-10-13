import test from 'node:test';
import assert from 'node:assert/strict';

import { evaluateTradingReadiness } from './readiness.ts';
import type { ReadinessContext } from './readiness.ts';

const readinessBase: ReadinessContext = {
  mode: 'live-review', liveExecutionEnabled: true,
  risk: { limits: { capital:100000, maxPositionPct:.1, maxOrderPct:.02, maxDailyLossPct:.02, maxDrawdownPct:.1, maxLeverage:2 }, hardVetoProbePassed:true, killSwitchClear:true, peakEquityValid:true },
  data: { latestMarketTs:1000, nowTs:1000, maxFreshnessMs:5000, pitValidated:true, sourceCount:2 },
  research: { latestOosPassed:true, latestWalkForwardPassed:true, validationTs:1000, maxAgeMs:86400000 },
  paper: { startedTs:1000, nowTs:1000, tradeCount:50, minTradeCount:50, snapshotHealthy:true },
  security: { sandboxSelfTestPassed:true, egressPolicyVerified:true, productionIsolationVerified:true, deploymentAttestationValid:true },
  governance: { ownerCapitalApprovalActive:true, capitalBudget:100000, riskEnvelopeValid:true },
  observability: { journalHealthy:true, postTradeAttributionHealthy:true, snapshotHealthy:true },
};

test('readiness blocks halted operational health', () => {
  const report = evaluateTradingReadiness({ ...readinessBase, operationalHealth:{ status:'halted', score:0.2 } }, 1000);
  assert.equal(report.readyForLive, false);
  assert.ok(report.gates.some((gate) => gate.id === 'operational-health' && !gate.ok));
});


test('readiness treats missing operational health as fail-closed', () => {
  const report = evaluateTradingReadiness({
    ...readinessBase,
    operationalHealth: undefined,
    mode: 'paper',
    liveExecutionEnabled: false,
  });
  const gate = report.gates.find((x) => x.id === 'operational-health');
  assert.equal(gate?.ok, false);
  assert.ok(gate?.reasons.includes('operational-cycle-health-missing'));
});

import type { RiskLimits } from '../runtime/tools/trading.ts';

export type ReadinessGateId = 'risk' | 'data' | 'research' | 'paper' | 'security' | 'connectors' | 'deployment-sandbox' | 'governance' | 'observability' | 'operational-health';
export interface ReadinessGate { id: ReadinessGateId; ok: boolean; required: boolean; reasons: string[] }

export interface ReadinessContext {
  mode: 'paper' | 'live-disabled' | 'live-review';
  liveExecutionEnabled: boolean;
  risk: { limits: RiskLimits; hardVetoProbePassed: boolean; killSwitchClear: boolean; peakEquityValid: boolean };
  data: { latestMarketTs: number; nowTs: number; maxFreshnessMs: number; pitValidated: boolean; sourceCount: number };
  research: { latestOosPassed: boolean; latestWalkForwardPassed: boolean; validationTs: number; maxAgeMs: number };
  paper: { startedTs: number; nowTs: number; tradeCount: number; minTradeCount: number; snapshotHealthy: boolean };
  security: { sandboxSelfTestPassed: boolean; egressPolicyVerified: boolean; productionIsolationVerified: boolean; deploymentAttestationValid: boolean; connectorReadinessVerified?: boolean; deploymentSandboxVerified?: boolean };
  governance: { ownerCapitalApprovalActive: boolean; capitalBudget: number; riskEnvelopeValid: boolean };
  observability: { journalHealthy: boolean; postTradeAttributionHealthy: boolean; snapshotHealthy: boolean };
  operationalHealth?: { status: 'healthy' | 'degraded' | 'halted'; score: number };
}

export interface ReadinessReport { readyForLive: boolean; gates: ReadinessGate[]; generatedAt: number; reasons: string[] }

function validRiskEnvelope(limits: RiskLimits): boolean {
  return Number.isFinite(limits.capital) && limits.capital > 0
    && limits.maxPositionPct > 0 && limits.maxPositionPct <= 1
    && limits.maxOrderPct > 0 && limits.maxOrderPct <= 1
    && limits.maxDailyLossPct >= 0 && limits.maxDailyLossPct <= 1
    && limits.maxDrawdownPct >= 0 && limits.maxDrawdownPct <= 1
    && limits.maxLeverage > 0 && limits.maxLeverage <= 100;
}

export function evaluateTradingReadiness(context: ReadinessContext, now = context.data.nowTs || Date.now()): ReadinessReport {
  const riskOk = validRiskEnvelope(context.risk.limits) && context.risk.hardVetoProbePassed && context.risk.killSwitchClear && context.risk.peakEquityValid;
  const dataAge = Math.max(0, now - context.data.latestMarketTs);
  const dataOk = context.data.pitValidated && context.data.sourceCount > 0 && dataAge <= Math.max(250, context.data.maxFreshnessMs);
  const researchAge = Math.max(0, now - context.research.validationTs);
  const researchOk = context.research.latestOosPassed && context.research.latestWalkForwardPassed && researchAge <= Math.max(60_000, context.research.maxAgeMs);
  const paperAge = Math.max(0, now - context.paper.nowTs);
  const paperOk = context.paper.startedTs > 0 && context.paper.tradeCount >= context.paper.minTradeCount && paperAge <= Math.max(60_000, context.paper.nowTs - context.paper.startedTs + 86_400_000) && context.paper.snapshotHealthy;
  const securityOk = context.security.sandboxSelfTestPassed && context.security.egressPolicyVerified && context.security.productionIsolationVerified && context.security.deploymentAttestationValid;
  const connectorReadinessOk = context.security.connectorReadinessVerified === true;
  const deploymentSandboxOk = context.security.deploymentSandboxVerified === true;
  const governanceOk = context.governance.ownerCapitalApprovalActive && context.governance.capitalBudget > 0 && context.governance.riskEnvelopeValid;
  const observabilityOk = context.observability.journalHealthy && context.observability.postTradeAttributionHealthy && context.observability.snapshotHealthy;
  const operationalHealth = context.operationalHealth ?? { status: 'halted' as const, score: 0 };
  const operationalHealthOk = operationalHealth.status === 'healthy' && operationalHealth.score >= 0.9; 

  const gates: ReadinessGate[] = [
    { id: 'risk', ok: riskOk, required: true, reasons: riskOk ? [] : ['hard-risk-engine-or-risk-envelope-not-certified'] },
    { id: 'data', ok: dataOk, required: true, reasons: dataOk ? [] : ['data-freshness-PIT-or-source-coverage-failed'] },
    { id: 'research', ok: researchOk, required: true, reasons: researchOk ? [] : ['recent-OOS-and-walk-forward-certification-missing'] },
    { id: 'paper', ok: paperOk, required: true, reasons: paperOk ? [] : ['paper-training-or-snapshot-gate-not-passed'] },
    { id: 'security', ok: securityOk, required: true, reasons: securityOk ? [] : ['sandbox-egress-production-isolation-or-deployment-attestation-not-certified'] },
    { id: 'connectors', ok: connectorReadinessOk, required: true, reasons: connectorReadinessOk ? [] : ['production-data-connectors-not-fully-reviewed-or-attested'] },
    { id: 'deployment-sandbox', ok: deploymentSandboxOk, required: true, reasons: deploymentSandboxOk ? [] : ['deployment-level-sandbox-not-attested'] },
    { id: 'governance', ok: governanceOk, required: true, reasons: governanceOk ? [] : ['owner-capital-budget-or-risk-envelope-not-active'] },
    { id: 'observability', ok: observabilityOk, required: true, reasons: observabilityOk ? [] : ['journal-post-trade-or-snapshot-observability-not-healthy'] },
    { id: 'operational-health', ok: operationalHealthOk, required: true, reasons: operationalHealthOk ? [] : [context.operationalHealth ? (operationalHealth.status === 'halted' ? 'operational-cycle-health-halted' : 'operational-cycle-health-below-threshold') : 'operational-cycle-health-missing'] },
  ];
  const reasons = gates.flatMap((gate) => gate.reasons);
  // Phase 1 cannot certify live execution. A future production layer must first set mode=live-review and explicitly enable a controlled executor.
  const modeGate = context.mode === 'live-review' && context.liveExecutionEnabled;
  if (!modeGate) reasons.push('live-execution-not-explicitly-enabled-for-controlled-review');
  const readyForLive = modeGate && gates.every((gate) => !gate.required || gate.ok);
  return { readyForLive, gates, generatedAt: now, reasons: [...new Set(reasons)] };
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { InMemorySmartMoneyStore } from './smart-money-store.ts';
import { attributePaperTrade, buildPerformanceSnapshot } from './post-trade.ts';
import { evaluateTradingReadiness } from './readiness.ts';
import { normalizeCftcPositioning } from './smart-money.ts';

test('Phase 1 smart-money store is idempotent and as-of safe', async () => {
  const store = new InMemorySmartMoneyStore();
  const batch = normalizeCftcPositioning({ market:'BTC', reportDate:1000, publishedTs:1100, availableTs:1200, long:80, short:20, category:'managed-money', source:'test', retrievedTs:1300 }, 2000);
  assert.equal(batch.observations.length, 1);
  const observation = batch.observations[0].value;
  assert.equal((await store.put(observation)).inserted, true);
  assert.equal((await store.put(observation)).inserted, false);
  assert.equal((await store.query({asset:'BTC', asOfTs:1199})).length, 0);
  assert.equal((await store.query({asset:'BTC', asOfTs:1200})).length, 1);
});

test('Phase 1 post-trade attribution snapshots performance by regime', async () => {
  const trades = [
    attributePaperTrade({ tradeId:'1', strategyId:'s1', symbol:'BTC', side:'buy', qty:1, entryPrice:100.5, entryBenchmarkPrice:100, exitPrice:109.5, exitBenchmarkPrice:110, grossPnl:10, fees:1, slippageCost:1, holdingMs:1000, regime:'trend', evidenceIds:[] }),
    attributePaperTrade({ tradeId:'2', strategyId:'s1', symbol:'BTC', side:'buy', qty:1, entryPrice:110.5, entryBenchmarkPrice:110, exitPrice:105.5, exitBenchmarkPrice:105, grossPnl:-5, fees:1, slippageCost:1, holdingMs:1000, regime:'trend', evidenceIds:[] }),
  ];
  const snapshot = await buildPerformanceSnapshot('s1', trades, Date.now());
  assert.equal(snapshot.tradeCount, 2);
  assert.equal(snapshot.wins, 1);
  assert.equal(snapshot.losses, 1);
  assert.equal(snapshot.netPnl, 1);
  assert.equal(snapshot.byRegime.trend.trades, 2);
  assert.equal(snapshot.byRegime.trend.winRate, 0.5);
  assert.ok(snapshot.attributionHash.length >= 32);
});

test('Phase 1 readiness is fail-closed from actual runtime facts', () => {
  const base = {
    mode:'live-disabled' as const, liveExecutionEnabled:false,
    risk:{limits:{capital:100_000,maxPositionPct:.1,maxOrderPct:.02,maxDailyLossPct:.02,maxDrawdownPct:.1,maxLeverage:2}, hardVetoProbePassed:true, killSwitchClear:true, peakEquityValid:true},
    data:{latestMarketTs:900, nowTs:1000, maxFreshnessMs:500, pitValidated:true, sourceCount:3},
    research:{latestOosPassed:true, latestWalkForwardPassed:true, validationTs:900, maxAgeMs:10_000},
    paper:{startedTs:100, nowTs:1000, tradeCount:100, minTradeCount:50, snapshotHealthy:true},
    security:{sandboxSelfTestPassed:true, egressPolicyVerified:true, productionIsolationVerified:false, deploymentAttestationValid:false},
    governance:{ownerCapitalApprovalActive:true, capitalBudget:100_000, riskEnvelopeValid:true},
    observability:{journalHealthy:true, postTradeAttributionHealthy:true, snapshotHealthy:true},
  };
  const report = evaluateTradingReadiness(base, 1000);
  assert.equal(report.readyForLive, false);
  assert.ok(report.reasons.includes('live-execution-not-explicitly-enabled-for-controlled-review'));
});

test('Phase 1 readiness only opens with explicit controlled-review mode and every gate', () => {
  const context = {
    mode:'live-review' as const, liveExecutionEnabled:true,
    risk:{limits:{capital:100_000,maxPositionPct:.1,maxOrderPct:.02,maxDailyLossPct:.02,maxDrawdownPct:.1,maxLeverage:2}, hardVetoProbePassed:true, killSwitchClear:true, peakEquityValid:true},
    data:{latestMarketTs:990, nowTs:1000, maxFreshnessMs:500, pitValidated:true, sourceCount:3},
    research:{latestOosPassed:true, latestWalkForwardPassed:true, validationTs:990, maxAgeMs:10_000},
    paper:{startedTs:100, nowTs:1000, tradeCount:100, minTradeCount:50, snapshotHealthy:true},
    // `connectorReadinessVerified` and `deploymentSandboxVerified` were added
    // as their own required gates once Phase 4/5 introduced production
    // connector review and deployment-sandbox attestation; this happy-path
    // fixture must supply both or it fails closed on the new gates instead
    // of exercising what the test name describes.
    security:{sandboxSelfTestPassed:true, egressPolicyVerified:true, productionIsolationVerified:true, deploymentAttestationValid:true, connectorReadinessVerified:true, deploymentSandboxVerified:true},
    governance:{ownerCapitalApprovalActive:true, capitalBudget:100_000, riskEnvelopeValid:true},
    observability:{journalHealthy:true, postTradeAttributionHealthy:true, snapshotHealthy:true},
    // `operationalHealth` was added as a required gate alongside the Phase 5
    // control plane's operational-cycle monitoring; omitting it defaults to
    // 'halted' and fails closed, same reasoning as above.
    operationalHealth:{status:'healthy' as const, score:1},
  };
  const report = evaluateTradingReadiness(context, 1000);
  assert.deepEqual(report.reasons, []);
  assert.equal(report.readyForLive, true);
});

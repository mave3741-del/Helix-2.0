import test from 'node:test';
import assert from 'node:assert/strict';
import { ServerTradingRuntime } from './runtime.ts';
import type { RiskLimits } from '../../runtime/tools/trading.ts';

const risk: RiskLimits = { capital: 100_000, maxPositionPct: .1, maxOrderPct: .02, maxDailyLossPct: .02, maxDrawdownPct: .1, maxLeverage: 2 };

test('runtime-integrated readiness is fail-closed and cannot be forged', () => {
  const runtime = new ServerTradingRuntime({ capital: 100_000, risk });
  const report = runtime.readinessReport(1_000);
  assert.equal(report.readyForLive, false);
  assert.ok(report.reasons.includes('live-execution-not-explicitly-enabled-for-controlled-review'));
});

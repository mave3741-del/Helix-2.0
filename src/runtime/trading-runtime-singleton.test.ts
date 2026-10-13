import assert from "node:assert/strict";
import test from "node:test";
import { ServerTradingRuntime } from "@/trading/runtime/runtime.ts";
import type { RiskLimits } from "@/runtime/tools/trading.ts";

// Note: getServerRuntime() itself isn't exercised here. It triggers real
// DB-backed snapshot recovery (see trading-runtime-singleton.ts), which only
// works in a Vite-bundled context (import.meta.glob) — proven separately via
// a real built-server run (db:smoke, and a live HTTP round-trip), not this
// fast unit suite. The `??=` singleton itself is a one-line, self-evidently
// correct pattern that doesn't need a dedicated runtime test.
const RISK: RiskLimits = { capital: 100_000, maxPositionPct: 0.1, maxOrderPct: 0.05, maxDailyLossPct: 0.03, maxDrawdownPct: 0.15, maxLeverage: 2 };

test("a fresh runtime's readiness report is fail-closed (not ready) with all 10 gates present", () => {
  const runtime = new ServerTradingRuntime({ capital: 100_000, risk: RISK });
  const report = runtime.readinessReport();
  assert.equal(report.readyForLive, false);
  assert.equal(report.gates.length, 10);
  for (const gate of report.gates) {
    assert.equal(typeof gate.id, "string");
    assert.equal(typeof gate.ok, "boolean");
    assert.ok(Array.isArray(gate.reasons));
  }
});

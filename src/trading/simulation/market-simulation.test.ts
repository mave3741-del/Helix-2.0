import assert from "node:assert/strict";
import test from "node:test";
import { simulateExecution } from "./market-simulation.ts";

test("market simulation models liquidity stress and partial fills", () => {
  const result = simulateExecution({ midPrice: 100, bidSize: 100, askSize: 100, requestedQty: 200, side: "buy", latencyMs: 20, baseSpreadBps: 5, shocks: [{ type: "liquidity", severity: 0.5, durationMs: 1000 }, { type: "partial_fill", severity: 0.2, durationMs: 1000 }] });
  assert.ok(result.filledQty < 200);
  assert.ok(result.stressScore > 0);
});

test("market simulation fails closed on severe outage", () => {
  const result = simulateExecution({ midPrice: 100, bidSize: 100, askSize: 100, requestedQty: 1, side: "buy", latencyMs: 20, baseSpreadBps: 5, shocks: [{ type: "exchange_outage", severity: 1, durationMs: 5000 }] });
  assert.equal(result.rejected, true);
  assert.equal(result.rejectReason, "exchange_outage");
});

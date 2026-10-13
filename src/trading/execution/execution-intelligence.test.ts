import assert from "node:assert/strict";
import test from "node:test";
import { attributeExecutionQuality, buildExecutionPlan, chooseVenue } from "./execution-intelligence.ts";

test("execution intelligence chooses healthy venue and builds TWAP plan", () => {
  const venue = chooseVenue([{ venue: "A", bid: 99, ask: 101, bidSize: 100, askSize: 100, feeBps: 8, healthy: true }, { venue: "B", bid: 99.5, ask: 100.5, bidSize: 200, askSize: 200, feeBps: 5, healthy: true }], "buy");
  assert.equal(venue.venue, "B");
  const plan = buildExecutionPlan({ side: "buy", qty: 80, referencePrice: 100, quotes: [venue], algorithm: "twap", slices: 8 });
  assert.equal(plan.slices.length, 8);
  assert.equal(plan.slices.reduce((s, x) => s + x.qty, 0), 80);
});

test("execution quality attributes partial fills", () => {
  const q = attributeExecutionQuality({ requestedQty: 100, benchmarkPrice: 100, fills: [{ venue: "A", qty: 50, price: 100.1, benchmarkPrice: 100, fee: 0.25, slippageBps: 10 }] });
  assert.equal(q.fillRate, 0.5);
  assert.ok(q.qualityScore < 100);
});

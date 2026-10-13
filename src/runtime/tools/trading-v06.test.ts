import test from "node:test";
import assert from "node:assert/strict";
import { executeGeneratedTool, builtInTradingTools } from "./factory.ts";

test("v0.6 native research/risk tool catalog is extended", () => {
  const names = new Set(builtInTradingTools().map((x) => x.name));
  for (const name of ["native.pit.validate", "native.data.quality", "native.strategy.mutate", "native.portfolio.check"]) {
    assert.ok(names.has(name));
  }
});

test("point-in-time validator rejects future information", () => {
  const result = executeGeneratedTool("native.pit.validate", { eventTs: 100, publishedTs: 200, availableTs: 300, asOfTs: 250 }) as { ok: boolean; reasons: string[] };
  assert.equal(result.ok, false);
  assert.ok(result.reasons.includes("not_available_at_asof"));
});

test("data quality catches duplicate and broken bars", () => {
  const bars = [
    { ts: 1, open: 10, high: 12, low: 9, close: 11, volume: 1 },
    { ts: 1, open: 10, high: 8, low: 9, close: 11, volume: -1 },
  ];
  const result = executeGeneratedTool("native.data.quality", { bars }) as { ok: boolean; reasons: string[] };
  assert.equal(result.ok, false);
  assert.ok(result.reasons.includes("duplicate_timestamps"));
  assert.ok(result.reasons.includes("invalid_ohlc"));
  assert.ok(result.reasons.includes("invalid_volume"));
});

test("strategy mutation stays bounded and reproducible", () => {
  const base = { id: "s1", family: "trend", market: "BTCUSDT", timeframe: "1m", features: ["atr", "rsi"], params: { fast: 10, slow: 30 }, version: 1 };
  const a = executeGeneratedTool("native.strategy.mutate", { strategy: base, seed: 7 }) as { strategy: { id: string; params: Record<string, number>; createdFrom: string } };
  const b = executeGeneratedTool("native.strategy.mutate", { strategy: base, seed: 7 }) as { strategy: { id: string; params: Record<string, number>; createdFrom: string } };
  assert.deepEqual(a, b);
  assert.equal(a.strategy.createdFrom, "s1");
  assert.ok(a.strategy.params.fast >= 8 && a.strategy.params.fast <= 12);
});

test("portfolio check rejects excessive concentration", () => {
  const result = executeGeneratedTool("native.portfolio.check", {
    equity: 1000,
    exposures: [{ symbol: "BTCUSDT", notional: 600, side: "long" }],
  }) as { ok: boolean; reasons: string[]; concentration: number };
  assert.equal(result.ok, false);
  assert.ok(result.reasons.includes("single_position_concentration"));
  assert.equal(result.concentration, 0.6);
});

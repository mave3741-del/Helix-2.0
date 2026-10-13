import test from "node:test";
import assert from "node:assert/strict";
import { builtInTradingTools, executeGeneratedTool } from "./factory.ts";
import { nativeRiskCheck } from "./trading.ts";

test("native trading tool catalog is available", () => {
  const tools = builtInTradingTools();
  assert.equal(tools.length, 16);
  assert.ok(tools.every((t) => t.implementation === "native"));
  assert.ok(tools.every((t) => !t.safety.credentialsAllowed && !t.safety.walletAccess));
});

test("market snapshot calculates spread, imbalance and freshness", () => {
  const result = executeGeneratedTool("native.market.snapshot", {
    symbol: "BTCUSDT", price: 100, bids: [{ price: 99, size: 2 }], asks: [{ price: 101, size: 1 }], ts: 1000, receivedAt: 1002, source: "test",
  }) as { spreadBps: number; imbalance: number; freshnessMs: number };
  assert.equal(Math.round(result.spreadBps * 100) / 100, 200);
  assert.equal(result.imbalance, 1 / 3);
  assert.equal(result.freshnessMs, 2);
});

test("risk gate rejects oversized order", () => {
  const result = executeGeneratedTool("native.risk.check", {
    side: "buy", qty: 20, price: 100, position: null,
    limits: { capital: 1000, maxPositionPct: 0.25, maxOrderPct: 0.1, maxDailyLossPct: 0.05, maxDrawdownPct: 0.1, maxLeverage: 2 }, dailyPnl: 0, equity: 1000,
  }) as { ok: boolean; reasons: string[] };
  assert.equal(result.ok, false);
  assert.ok(result.reasons.includes("order_limit_exceeded"));
});

test("position sizing and paper order are deterministic", () => {
  const size = executeGeneratedTool("native.position.size", { equity: 10_000, riskPct: 0.01, entry: 100, stop: 95, maxLeverage: 2 }) as { qty: number; riskAmount: number };
  assert.equal(size.riskAmount, 100);
  assert.equal(size.qty, 20);
  const fill = executeGeneratedTool("native.paper.order", { symbol: "BTCUSDT", side: "buy", qty: 2, bid: 99, ask: 101, feeBps: 5, ts: 1 }) as { fill: number; fee: number };
  assert.equal(fill.fill, 101);
  assert.equal(fill.fee, 0.101);
});


test("native research features work", () => {
  const rsi = executeGeneratedTool("native.rsi", { closes: [1, 1.1, 1.2, 1.15, 1.3], period: 4 }) as { rsi: number };
  assert.ok(rsi.rsi > 0 && rsi.rsi <= 100);
  const z = executeGeneratedTool("native.zscore", { values: [1, 2, 3, 4, 5], window: 5 }) as { zscore: number };
  assert.ok(z.zscore > 0);
  const whale = executeGeneratedTool("native.whale.signal", { inflow: 10, outflow: 50, baseline: 40, priceChangePct: 1 }) as { label: string; score: number };
  assert.equal(whale.label, "accumulation");
  assert.ok(whale.score > 0);
});

test("risk gate enforces portfolio leverage even when each individual position is within its own cap", () => {
  const first = nativeRiskCheck({
    side: "buy", qty: 5, price: 100,
    position: null,
    limits: { capital: 1000, maxPositionPct: 1, maxOrderPct: 1, maxDailyLossPct: 0.05, maxDrawdownPct: 0.2, maxLeverage: 1 },
    dailyPnl: 0, equity: 1000,
    existingGrossExposureNotional: 0,
    peakEquity: 1000,
  });
  assert.equal(first.ok, true);
  const second = nativeRiskCheck({
    side: "buy", qty: 6, price: 100,
    position: null,
    limits: { capital: 1000, maxPositionPct: 1, maxOrderPct: 1, maxDailyLossPct: 0.05, maxDrawdownPct: 0.2, maxLeverage: 1 },
    dailyPnl: 0, equity: 1000,
    existingGrossExposureNotional: 500,
    peakEquity: 1000,
  });
  assert.equal(second.ok, false);
  assert.ok(second.reasons.includes("leverage_limit_exceeded"));
});

test("risk gate enforces hard drawdown from the equity high-water mark", () => {
  const result = nativeRiskCheck({
    side: "buy", qty: 1, price: 100,
    position: null,
    limits: { capital: 1000, maxPositionPct: 1, maxOrderPct: 1, maxDailyLossPct: 0.5, maxDrawdownPct: 0.1, maxLeverage: 2 },
    dailyPnl: 0, equity: 890,
    peakEquity: 1000,
  });
  assert.equal(result.ok, false);
  assert.ok(result.reasons.includes("max_drawdown_exceeded"));
  assert.equal(result.drawdownPct, 0.11);
});

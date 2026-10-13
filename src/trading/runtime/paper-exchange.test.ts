import test from "node:test";
import assert from "node:assert/strict";
import { PaperExchange } from "./paper-exchange.ts";

test("market orders model fee, spread and configurable slippage", () => {
  const ex = new PaperExchange(10_000, 10, { baseSlippageBps: 5 });
  const fill = ex.submit({ clientOrderId: "m1", symbol: "BTCUSDT", side: "buy", qty: 2, bid: 100, ask: 101, askSize: 2, ts: 1_000 });
  assert.equal(fill.qty, 2);
  assert.ok(fill.price > 101);
  assert.ok(fill.fee > 0);
  assert.ok(fill.slippageBps > 0);
  assert.equal(ex.getOrder("m1")?.status, "filled");
});

test("limit orders remain open until the quote crosses the limit", () => {
  const ex = new PaperExchange(10_000, 5, { baseSlippageBps: 0 });
  const order = ex.openOrder({ clientOrderId: "l1", symbol: "ETHUSDT", side: "buy", qty: 4, orderType: "limit", limitPrice: 99, bid: 99, ask: 101, ts: 1_000 });
  assert.equal(order.status, "open");
  assert.equal(ex.processTick({ symbol: "ETHUSDT", bid: 99, ask: 101, bidSize: 10, askSize: 1, ts: 1_100 }, "l1").fills.length, 0);
  const result = ex.processTick({ symbol: "ETHUSDT", bid: 98, ask: 99, bidSize: 10, askSize: 2, ts: 1_200 }, "l1");
  assert.equal(result.fills[0].qty, 2);
  assert.equal(result.order?.status, "partially_filled");
  const done = ex.processTick({ symbol: "ETHUSDT", bid: 98, ask: 99, bidSize: 10, askSize: 2, ts: 1_300 }, "l1");
  assert.equal(done.fills[0].qty, 2);
  assert.equal(done.order?.status, "filled");
});

test("cancel prevents later fills", () => {
  const ex = new PaperExchange(10_000);
  ex.openOrder({ clientOrderId: "c1", symbol: "SOLUSDT", side: "sell", qty: 3, orderType: "limit", limitPrice: 110, bid: 99, ask: 101, ts: 1_000 });
  assert.equal(ex.cancel("c1", 1_050).status, "cancelled");
  assert.equal(ex.processTick({ symbol: "SOLUSDT", bid: 110, ask: 111, bidSize: 10, askSize: 10, ts: 1_100 }, "c1").fills.length, 0);
});

test("repeated client order id is idempotent", () => {
  const ex = new PaperExchange(10_000, 5, { baseSlippageBps: 0 });
  const a = ex.submit({ clientOrderId: "retry", symbol: "BTCUSDT", side: "buy", qty: 1, bid: 100, ask: 101, ts: 1_000 });
  const b = ex.submit({ clientOrderId: "retry", symbol: "BTCUSDT", side: "buy", qty: 1, bid: 100, ask: 101, ts: 2_000 });
  assert.deepEqual(b, a);
  assert.equal(ex.snapshot().positions.BTCUSDT.qty, 1);
});

test("fills preserve strategy, regime and evidence provenance from the order", () => {
  const ex = new PaperExchange(10_000);
  const fill = ex.submit({ clientOrderId: "metadata-1", symbol: "BTCUSDT", side: "buy", qty: 1, bid: 100, ask: 101, askSize: 2, ts: 5_000, strategyId: "s-meta", regime: "trend", evidenceIds: ["ev-1", "ev-2"] });
  assert.equal(fill.strategyId, "s-meta");
  assert.equal(fill.regime, "trend");
  assert.deepEqual(fill.evidenceIds, ["ev-1", "ev-2"]);
});


test("scale-in immediately revalues against the latest mark", () => {
  const ex = new PaperExchange(100_000, 0, { baseSlippageBps: 0 });
  ex.mark("BTCUSDT", 100);
  const first = ex.submit({ clientOrderId: "scale-1", symbol: "BTCUSDT", side: "buy", qty: 10, bid: 99, ask: 101, ts: 1_000 });
  ex.mark("BTCUSDT", 110);
  const second = ex.submit({ clientOrderId: "scale-2", symbol: "BTCUSDT", side: "buy", qty: 10, bid: 109, ask: 111, ts: 2_000 });
  const account = ex.snapshot();
  const expectedAvg = (first.qty * first.price + second.qty * second.price) / (first.qty + second.qty);
  assert.equal(account.positions.BTCUSDT.avgPrice, expectedAvg);
  assert.equal(account.positions.BTCUSDT.unrealizedPnl, 20 * (110 - expectedAvg));
  assert.equal(account.equity, account.cash + 20 * 110);
});

test("paper execution snapshot preserves last marks across restore", () => {
  const ex = new PaperExchange(10_000, 0, { baseSlippageBps: 0 });
  ex.mark("ETHUSDT", 110);
  const first = ex.submit({ clientOrderId: "restore-mark", symbol: "ETHUSDT", side: "buy", qty: 1, bid: 99, ask: 100, ts: 1_000 });
  const snapshot = ex.exportState();
  const restored = new PaperExchange(1_000);
  restored.restoreState(snapshot);
  const second = restored.submit({ clientOrderId: "restore-fill", symbol: "ETHUSDT", side: "buy", qty: 1, bid: 109, ask: 110, ts: 2_000 });
  const expectedAvg = (first.price + second.price) / 2;
  assert.equal(restored.snapshot().positions.ETHUSDT.avgPrice, expectedAvg);
  assert.equal(restored.snapshot().positions.ETHUSDT.unrealizedPnl, 2 * (110 - expectedAvg));
});

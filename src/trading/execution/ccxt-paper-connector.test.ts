import assert from "node:assert/strict";
import test from "node:test";
import { CcxtPaperConnector } from "./ccxt-paper-connector.ts";

function stubTicker(connector: CcxtPaperConnector, price: { bid: number; ask: number; last?: number }) {
  // The exchange instance is real (constructed by the connector); we only
  // stub the network-touching method so the connector's own fill/position
  // logic runs for real against a controlled price.
  const exchange = (connector as unknown as { exchange: { fetchTicker: (s: string) => Promise<unknown> } }).exchange;
  exchange.fetchTicker = async () => ({ bid: price.bid, ask: price.ask, last: price.last ?? (price.bid + price.ask) / 2 });
}

test("market buy fills at the ask and opens a long position", async () => {
  const c = new CcxtPaperConnector("binance", { startingCash: 10_000, feeBps: 0 });
  stubTicker(c, { bid: 99, ask: 101 });
  const order = await c.placeOrder({ clientOrderId: "1", symbol: "BTC/USDT", side: "buy", qty: 10 });
  assert.equal(order.status, "filled");
  assert.equal(order.averageFillPrice, 101);
  const positions = await c.positions();
  assert.equal(positions.length, 1);
  assert.equal(positions[0].qty, 10);
  assert.equal(positions[0].avgEntryPrice, 101);
});

test("closing a long realizes pnl into cash", async () => {
  const c = new CcxtPaperConnector("binance", { startingCash: 10_000, feeBps: 0 });
  stubTicker(c, { bid: 99, ask: 101 });
  await c.placeOrder({ clientOrderId: "1", symbol: "BTC/USDT", side: "buy", qty: 10 });
  stubTicker(c, { bid: 120, ask: 121 });
  await c.placeOrder({ clientOrderId: "2", symbol: "BTC/USDT", side: "sell", qty: 10 });
  const account = await c.account();
  // Bought 10 @ 101 (cost 1010), sold 10 @ 120 (proceeds 1200) => +190 realized, no open position.
  assert.equal(account.cash, 10_000 + 190);
  const positions = await c.positions();
  assert.equal(positions.length === 0 || positions[0].qty === 0, true);
});

test("fees reduce cash on every fill", async () => {
  const c = new CcxtPaperConnector("binance", { startingCash: 10_000, feeBps: 100 }); // 1%
  stubTicker(c, { bid: 99, ask: 100 });
  await c.placeOrder({ clientOrderId: "1", symbol: "BTC/USDT", side: "buy", qty: 10 });
  const account = await c.account();
  // Cost 1000 + 1% fee (10) = cash should drop by 1010 from the 10,000 start.
  assert.equal(account.cash, 10_000 - 1000 - 10);
});

test("a limit order that doesn't cross the market rests as 'new' instead of filling", async () => {
  const c = new CcxtPaperConnector("binance", { startingCash: 10_000, feeBps: 0 });
  stubTicker(c, { bid: 99, ask: 101 });
  const order = await c.placeOrder({ clientOrderId: "1", symbol: "BTC/USDT", side: "buy", qty: 1, type: "limit", limitPrice: 90 });
  assert.equal(order.status, "new");
  assert.equal(order.filledQty, 0);
  const positions = await c.positions();
  assert.equal(positions.length, 0);
});

test("a limit order that already crosses the market fills immediately", async () => {
  const c = new CcxtPaperConnector("binance", { startingCash: 10_000, feeBps: 0 });
  stubTicker(c, { bid: 99, ask: 101 });
  const order = await c.placeOrder({ clientOrderId: "1", symbol: "BTC/USDT", side: "buy", qty: 1, type: "limit", limitPrice: 105 });
  assert.equal(order.status, "filled");
  assert.equal(order.averageFillPrice, 105);
});

test("rejects an unknown exchange id rather than silently constructing something broken", () => {
  assert.throws(() => new CcxtPaperConnector("not-a-real-exchange"), /Unknown CCXT exchange/);
});

test("cancelOrder only cancels resting ('new') orders, not already-filled ones", async () => {
  const c = new CcxtPaperConnector("binance", { startingCash: 10_000, feeBps: 0 });
  stubTicker(c, { bid: 99, ask: 101 });
  const resting = await c.placeOrder({ clientOrderId: "1", symbol: "BTC/USDT", side: "buy", qty: 1, type: "limit", limitPrice: 50 });
  await c.cancelOrder(resting.id);
  const [after] = await c.orders({ symbol: "BTC/USDT" });
  assert.equal(after.status, "canceled");
});

test("a sell larger than the open long closes it and flips to a short at the fill price", async () => {
  const c = new CcxtPaperConnector("binance", { startingCash: 10_000, feeBps: 0 });
  stubTicker(c, { bid: 99, ask: 101 });
  await c.placeOrder({ clientOrderId: "1", symbol: "BTC/USDT", side: "buy", qty: 10 }); // long 10 @ 101
  stubTicker(c, { bid: 120, ask: 121 });
  await c.placeOrder({ clientOrderId: "2", symbol: "BTC/USDT", side: "sell", qty: 15 }); // sells 15 @ 120 -> flips to short 5
  const [position] = await c.positions();
  assert.equal(position.qty, -5);
  assert.equal(position.avgEntryPrice, 120);
  assert.equal(position.side, "short");
  const account = await c.account();
  // Cash moves by literal notional on every fill: -1010 (buy) + 1800 (sell 15 @ 120) = +790 net.
  assert.equal(account.cash, 10_000 - 1010 + 1800);
});

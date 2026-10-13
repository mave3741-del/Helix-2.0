import test from "node:test";
import assert from "node:assert/strict";
import { AlpacaQuoteAdapter, BinanceBookTickerAdapter, type RealtimeWebSocket } from "./realtime.ts";

class FakeSocket implements RealtimeWebSocket {
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onclose: (() => void) | null = null;
  sent: string[] = [];
  closed = false;
  send(data: string): void { this.sent.push(data); }
  close(): void { this.closed = true; }
  push(value: unknown): void { this.onmessage?.({ data: JSON.stringify(value) }); }
}

test("binance adapter normalizes combined bookTicker and aggTrade events", async () => {
  let socket!: FakeSocket;
  const adapter = new BinanceBookTickerAdapter({ symbol: "BTCUSDT", endpoint: "wss://test.invalid/stream", wsFactory: () => (socket = new FakeSocket()) });
  const ticks: number[] = [];
  await adapter.connect((tick) => { ticks.push(tick.last); });
  socket.onopen?.();
  socket.push({ stream: "btcusdt@aggTrade", data: { e: "aggTrade", p: "101", E: 1000, T: 1000 } });
  socket.push({ stream: "btcusdt@bookTicker", data: { e: "bookTicker", b: "100", a: "102", B: "2", A: "3", E: 1001 } });
  assert.deepEqual(ticks, [101]);
  assert.equal(socket.closed, false);
  await adapter.disconnect();
  assert.equal(socket.closed, true);
});

test("alpaca quote adapter authenticates and emits normalized quotes", async () => {
  let socket!: FakeSocket;
  const adapter = new AlpacaQuoteAdapter({ symbol: "BTC/USD", asset: "crypto", key: "k", secret: "s", endpoint: "wss://test.invalid", wsFactory: () => (socket = new FakeSocket()) });
  const ticks: Array<{ bid: number; ask: number }> = [];
  await adapter.connect((tick) => { ticks.push({ bid: tick.bid, ask: tick.ask }); });
  socket.onopen?.();
  assert.match(socket.sent[0], /auth/);
  assert.match(socket.sent[1], /subscribe/);
  socket.push([{ T: "q", S: "BTC/USD", bp: 100, bs: 4, ap: 101, as: 5, t: "2026-09-10T12:00:00.000Z" }]);
  assert.deepEqual(ticks, [{ bid: 100, ask: 101 }]);
  await adapter.disconnect();
});

import test from "node:test";
import assert from "node:assert/strict";
import { buildReplayManifest, verifyReplayManifest } from "./replay-manifest.ts";
import { InMemoryMarketTickRecorder } from "./runtime/journal.ts";
import { createTradingEvent } from "./runtime/event-bus.ts";

const tick = (sequence: number, exchangeTs: number, symbol = "BTCUSDT") => ({
  symbol, venue: "binance", market: "crypto" as const, bid: 100 + sequence, ask: 101 + sequence, last: 100.5 + sequence,
  bidSize: 2, askSize: 1, sequence, exchangeTs, receivedTs: exchangeTs + 2,
});

test("replay manifest is deterministic for the same persisted tick range", async () => {
  const recorder = new InMemoryMarketTickRecorder();
  for (const [id, seq, ts] of [["evt-2", 2, 200], ["evt-1", 1, 100], ["evt-3", 3, 300]] as const) {
    await recorder.record(createTradingEvent("market.tick", "test", tick(seq, ts), ts, id));
  }
  const a = await buildReplayManifest(recorder, { symbol: "BTCUSDT", venue: "binance", fromTs: 100, toTs: 300 });
  const b = await buildReplayManifest(recorder, { symbol: "BTCUSDT", venue: "binance", fromTs: 100, toTs: 300 });
  assert.equal(a.manifest.manifestId, b.manifest.manifestId);
  assert.equal(a.manifest.dataHash, b.manifest.dataHash);
  assert.equal(a.manifest.manifestHash, b.manifest.manifestHash);
  assert.deepEqual(a.records.map((r) => r.tick.sequence), [1, 2, 3]);
});

test("replay manifest excludes ticks outside the requested range", async () => {
  const recorder = new InMemoryMarketTickRecorder();
  await recorder.record(createTradingEvent("market.tick", "test", tick(1, 100), 100, "evt-1"));
  await recorder.record(createTradingEvent("market.tick", "test", tick(2, 200), 200, "evt-2"));
  await recorder.record(createTradingEvent("market.tick", "test", tick(3, 300), 300, "evt-3"));
  const built = await buildReplayManifest(recorder, { symbol: "BTCUSDT", fromTs: 150, toTs: 250 });
  assert.equal(built.manifest.tickCount, 1);
  assert.equal(built.records[0]?.eventId, "evt-2");
});

test("replay manifest verifies provenance and detects tampering", async () => {
  const recorder = new InMemoryMarketTickRecorder();
  await recorder.record(createTradingEvent("market.tick", "test", tick(1, 100), 100, "evt-1"));
  await recorder.record(createTradingEvent("market.tick", "test", tick(2, 200), 200, "evt-2"));
  const built = await buildReplayManifest(recorder, { symbol: "BTCUSDT", fromTs: 100, toTs: 200 });
  assert.equal(await verifyReplayManifest(built.manifest, built.records), true);
  const tampered = structuredClone(built.records);
  tampered[1]!.tick.last += 0.01;
  assert.equal(await verifyReplayManifest(built.manifest, tampered), false);
});

test("duplicate logical market ticks are rejected", async () => {
  const recorder = new InMemoryMarketTickRecorder();
  await recorder.record(createTradingEvent("market.tick", "test", tick(1, 100), 100, "evt-1"));
  await recorder.record(createTradingEvent("market.tick", "test", tick(1, 100), 100, "evt-2"));
  await assert.rejects(() => buildReplayManifest(recorder, { symbol: "BTCUSDT", fromTs: 100, toTs: 100 }), /duplicate_market_tick/);
});


test("manifest ordering remains deterministic across symbols when no symbol filter is supplied", async () => {
  const recorder = new InMemoryMarketTickRecorder();
  await recorder.record(createTradingEvent("market.tick", "test", tick(2, 200, "ETHUSDT"), 200, "evt-b"));
  await recorder.record(createTradingEvent("market.tick", "test", tick(1, 100, "BTCUSDT"), 100, "evt-a"));
  const built = await buildReplayManifest(recorder, { fromTs: 100, toTs: 200 });
  assert.deepEqual(built.records.map((r) => [r.tick.symbol, r.tick.exchangeTs]), [["BTCUSDT", 100], ["ETHUSDT", 200]]);
  assert.equal(await verifyReplayManifest(built.manifest, built.records), true);
});

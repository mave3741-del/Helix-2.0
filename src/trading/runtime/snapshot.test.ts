import test from "node:test";
import assert from "node:assert/strict";
import { InMemoryRuntimeSnapshotStore, type TradingRuntimeSnapshot } from "./snapshot.ts";

test("in-memory runtime snapshots replace the latest checkpoint deterministically", async () => {
  const store = new InMemoryRuntimeSnapshotStore();
  const base = { schemaVersion: 1 as const, runtimeId: "r1", savedAt: 1000, runtimeState: { mode: "paper" as const, capitalLimit: 1000, allocatedCapital: 0, dailyPnl: 0, killSwitch: false, eventsProcessed: 0, lastMarketTs: 0, peakEquity: 1000, hardDrawdownBreached: false }, paper: { account: { startingCash: 1000, cash: 1000, equity: 1000, realizedPnl: 0, fees: 0, positions: {} }, orders: [], fills: [] }, eventCursor: null };
  const first: TradingRuntimeSnapshot = { ...base };
  await store.save(first);
  const second: TradingRuntimeSnapshot = { ...first, savedAt: 2000, runtimeState: { ...first.runtimeState, capitalLimit: 900 } };
  await store.save(second);
  assert.deepEqual(await store.latest("r1"), second);
});

test("runtime snapshot schema version is explicit", async () => {
  const store = new InMemoryRuntimeSnapshotStore();
  const snapshot: TradingRuntimeSnapshot = { schemaVersion: 1, runtimeId: "schema", savedAt: 1, runtimeState: { mode: "paper", capitalLimit: 1, allocatedCapital: 0, dailyPnl: 0, killSwitch: false, eventsProcessed: 0, lastMarketTs: 0, peakEquity: 1, hardDrawdownBreached: false }, paper: { account: { startingCash: 1, cash: 1, equity: 1, realizedPnl: 0, fees: 0, positions: {} }, orders: [], fills: [] }, eventCursor: { ts: 1, eventId: "e1" } };
  await store.save(snapshot);
  assert.equal((await store.latest("schema"))?.schemaVersion, 1);
});

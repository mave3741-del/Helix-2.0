import test from "node:test";
import assert from "node:assert/strict";
import { replayBars } from "./replay.ts";

test("market replay is chronological and point-in-time by construction", () => {
  const bars = [
    { ts: 3, open: 12, high: 13, low: 11, close: 12.5, volume: 1 },
    { ts: 1, open: 10, high: 11, low: 9, close: 10.5, volume: 1 },
    { ts: 2, open: 10.5, high: 12, low: 10, close: 11.5, volume: 1 },
  ];
  const decisions = replayBars(bars, (history) => history.length >= 2 ? "long" : "flat");
  assert.deepEqual(decisions.map((x) => x.ts), [1, 2]);
  assert.equal(decisions[0].signal, "flat");
  assert.equal(decisions[1].signal, "long");
  assert.ok(decisions[0].nextReturn > 0);
});

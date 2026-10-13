import test from "node:test";
import assert from "node:assert/strict";
import { InMemoryTradingEventJournal } from "./journal.ts";
import { createTradingEvent } from "./event-bus.ts";

test("event journal is append-only and idempotent", async () => {
  const journal = new InMemoryTradingEventJournal();
  const event = createTradingEvent("market.tick", "test", { n: 1 }, 1000, "evt-1");
  assert.equal(await journal.append(event), true);
  assert.equal(await journal.append(event), false);
  assert.deepEqual(await journal.getById("evt-1"), event);
});

test("event journal returns deterministic cursor order", async () => {
  const journal = new InMemoryTradingEventJournal();
  await journal.append(createTradingEvent("a", "t", { n: 1 }, 1000, "a-1"));
  await journal.append(createTradingEvent("b", "t", { n: 2 }, 1000, "b-1"));
  await journal.append(createTradingEvent("a", "t", { n: 3 }, 1001, "a-2"));
  assert.deepEqual((await journal.list({ afterTs: 1000, afterEventId: "a-1" })).map((x) => x.id), ["b-1", "a-2"]);
});

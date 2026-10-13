import assert from "node:assert/strict";
import test from "node:test";
import { migrateSnapshot } from "./migrate.ts";
import { seedOrganization } from "../org/seed.ts";

test("fresh organization defaults to local-only sandbox mode", () => {
  const state = seedOrganization(1);
  assert.equal(state.runtime.liveMode, false);
  assert.equal(state.runtime.routingMode, "local-only");
  assert.equal(state.runtime.mode, "sandbox");
});

test("legacy snapshots without runtime fail closed to local-only sandbox", () => {
  const state = seedOrganization(1);
  state.runtime = undefined as never;
  migrateSnapshot(state);
  assert.equal(state.runtime.liveMode, false);
  assert.equal(state.runtime.routingMode, "local-only");
  assert.equal(state.runtime.mode, "sandbox");
});

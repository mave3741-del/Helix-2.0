import test from "node:test";
import assert from "node:assert/strict";
import { seedOrganization } from "./seed.ts";
import { setRoutingMode } from "./engine.ts";

test("provider routing never enables live execution", () => {
  const state = seedOrganization();
  state.runtime.liveMode = true;
  setRoutingMode(state, "cloud-first");
  assert.equal(state.runtime.routingMode, "cloud-first");
  assert.equal(state.runtime.liveMode, false);
});

import test from "node:test";
import assert from "node:assert/strict";
import { StrategyEvolutionLab } from "./evolution.ts";

test("strategy evolution preserves lineage and champion status", () => {
  const lab = new StrategyEvolutionLab();
  lab.add({ id: "base", family: "trend", market: "BTCUSDT", timeframe: "1m", features: ["rsi"], params: { fast: 10 }, version: 1 }, 0.4);
  const child = lab.mutate("base", 4);
  assert.equal(child.parentId, "base");
  assert.equal(child.status, "challenger");
  lab.promote(child.strategy.id);
  assert.equal(lab.champion()?.strategy.id, child.strategy.id);
  assert.equal(lab.champion()?.status, "champion");
});

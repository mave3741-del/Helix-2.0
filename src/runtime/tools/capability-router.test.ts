import test from "node:test";
import assert from "node:assert/strict";
import { nativeCapabilityGrants, nativeToolsForCapabilities, nativeToolsForWorker, isNativeToolAllowedForWorker } from "./capability-router.ts";
import { advanceNativeToolLifecycle, builtInTradingTools, createNativeToolRegistry, registerNativeTool } from "./factory.ts";

function worker(capabilities: string[], toolPermissions: string[] = ["trading", "research", "risk"] as string[]) {
  return { capabilities, toolPermissions };
}

test("capability router grants only mapped native tools", () => {
  const tools = nativeToolsForCapabilities(["risk"]);
  assert.deepEqual(tools, ["native.portfolio.check", "native.position.size", "native.risk.check"]);
});

test("permission intersection prevents capability escalation", () => {
  const tools = nativeToolsForCapabilities(["risk"], ["native.risk.check", "refuse"] as never[]);
  assert.deepEqual(tools, ["native.risk.check"]);
});

test("1000-worker style capability profiles resolve deterministically", () => {
  const a = nativeToolsForWorker(worker(["on-chain", "entity-intelligence"]));
  const b = nativeToolsForWorker(worker(["on-chain", "entity-intelligence"]));
  assert.deepEqual(a, b);
  assert.deepEqual(a, ["native.whale.signal"]);
});

test("unrelated capability cannot invoke another tool", () => {
  assert.equal(isNativeToolAllowedForWorker("native.whale.signal", worker(["risk"])), false);
  assert.equal(isNativeToolAllowedForWorker("native.risk.check", worker(["risk"])), true);
});

test("capability grants expose provenance of why each tool is available", () => {
  const grants = nativeCapabilityGrants(["market-data", "technical"]);
  const rsi = grants.find((g) => g.tool.id === "native.rsi");
  assert.deepEqual(rsi?.capabilities, ["market-data", "technical"]);
});


test("durable registry discovery exposes only deployed native tools", () => {
  const registry = createNativeToolRegistry();
  const rsi = registerNativeTool(registry, builtInTradingTools().find((x) => x.id === "native.rsi")!, "phase8.11-test");
  const atr = registerNativeTool(registry, builtInTradingTools().find((x) => x.id === "native.atr")!, "phase8.11-test");
  advanceNativeToolLifecycle(registry, rsi.id, "tested");
  advanceNativeToolLifecycle(registry, rsi.id, "approved");
  advanceNativeToolLifecycle(registry, rsi.id, "deployed");
  const tools = nativeToolsForWorker(worker(["technical"]), registry);
  assert.deepEqual(tools, ["native.rsi"]);
  const grants = nativeCapabilityGrants(["technical"], [], registry);
  assert.deepEqual(grants.map((x) => x.tool.id), ["native.rsi"]);
  void atr;
});

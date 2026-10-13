import test from "node:test";
import assert from "node:assert/strict";
import { advanceNativeToolLifecycle, builtInTradingTools, InMemoryNativeToolRegistryStore, registerNativeTool } from "./factory.ts";
import { reconcileNativeToolRegistry } from "./registry-bootstrap.ts";

test("registry bootstrap seeds missing built-ins as proposed without deploying them", async () => {
  const store = new InMemoryNativeToolRegistryStore();
  const result = await reconcileNativeToolRegistry({ store });
  assert.equal(result.seeded.length, builtInTradingTools().length);
  assert.equal(result.deployed.length, 0);
  assert.equal(result.drifted.length, 0);
  const rsi = await store.get("native.rsi");
  assert.equal(rsi?.lifecycle, "proposed");
});

test("registry bootstrap hydrates durable deployed tools after restart", async () => {
  const store = new InMemoryNativeToolRegistryStore();
  const first = registerNativeTool(new Map(), builtInTradingTools().find((x) => x.id === "native.rsi")!, "phase8.11-test");
  advanceNativeToolLifecycle(new Map([[first.id, first]]), first.id, "tested");
  const registry = new Map([[first.id, { ...first }]]);
  const tested = advanceNativeToolLifecycle(registry, first.id, "tested");
  const approved = advanceNativeToolLifecycle(registry, first.id, "approved");
  const deployed = advanceNativeToolLifecycle(registry, first.id, "deployed");
  await store.upsert(deployed);

  const restarted = await reconcileNativeToolRegistry({ store, seedMissingBuiltIns: false });
  assert.ok(restarted.loaded.includes("native.rsi"));
  assert.ok(restarted.deployed.includes("native.rsi"));
  assert.equal(restarted.registry.get("native.rsi")?.lifecycle, "deployed");
  void tested; void approved;
});

test("registry bootstrap fail-closes code drift for deployed built-ins", async () => {
  const store = new InMemoryNativeToolRegistryStore();
  const base = registerNativeTool(new Map(), builtInTradingTools().find((x) => x.id === "native.atr")!, "phase8.11-test");
  const registry = new Map([[base.id, base]]);
  advanceNativeToolLifecycle(registry, base.id, "tested");
  advanceNativeToolLifecycle(registry, base.id, "approved");
  const deployed = advanceNativeToolLifecycle(registry, base.id, "deployed");
  await store.upsert({ ...deployed, implementationHash: "f".repeat(64) });

  const result = await reconcileNativeToolRegistry({ store, seedMissingBuiltIns: false });
  assert.deepEqual(result.drifted, ["native.atr"]);
  assert.equal(result.registry.has("native.atr"), false);
});

test("registry bootstrap blocks unsafe durable records even when lifecycle is deployed", async () => {
  const store = new InMemoryNativeToolRegistryStore();
  const base = registerNativeTool(new Map(), builtInTradingTools().find((x) => x.id === "native.zscore")!, "phase8.11-test");
  const registry = new Map([[base.id, base]]);
  advanceNativeToolLifecycle(registry, base.id, "tested");
  advanceNativeToolLifecycle(registry, base.id, "approved");
  const deployed = advanceNativeToolLifecycle(registry, base.id, "deployed");
  await store.upsert({ ...deployed, safety: { sandboxed: true, credentialsAllowed: true, walletAccess: false } });

  const result = await reconcileNativeToolRegistry({ store, seedMissingBuiltIns: false });
  assert.deepEqual(result.blocked, ["native.zscore"]);
  assert.equal(result.registry.has("native.zscore"), false);
});

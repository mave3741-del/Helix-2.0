import test from "node:test";
import assert from "node:assert/strict";
import { advanceNativeToolLifecycle, builtInTradingTools, createNativeToolRegistry, executeRegisteredNativeTool, registerNativeTool, InMemoryNativeToolRegistryStore } from "./factory.ts";

test("native tool registry starts proposed and requires provenance", () => {
  const registry = createNativeToolRegistry();
  const tool = builtInTradingTools()[0];
  assert.throws(() => registerNativeTool(registry, tool, ""), /provenance/i);
  const record = registerNativeTool(registry, tool, "phase8.9-test");
  assert.equal(record.lifecycle, "proposed");
  assert.match(record.schemaHash, /^[0-9a-f]{64}$/);
});

test("native tool lifecycle advances only through approved order", () => {
  const registry = createNativeToolRegistry();
  const tool = registerNativeTool(registry, builtInTradingTools()[0], "phase8.9-test");
  advanceNativeToolLifecycle(registry, tool.id, "tested");
  advanceNativeToolLifecycle(registry, tool.id, "approved");
  advanceNativeToolLifecycle(registry, tool.id, "deployed");
  assert.throws(() => advanceNativeToolLifecycle(registry, tool.id, "approved"), /transition/i);
});

test("unapproved native tool cannot execute", () => {
  const registry = createNativeToolRegistry();
  const tool = registerNativeTool(registry, builtInTradingTools().find((x) => x.id === "native.rsi")!, "phase8.9-test");
  assert.throws(() => executeRegisteredNativeTool(registry, tool.id, { closes: [1, 2, 3, 4, 5] }), /not deployed/i);
});

test("deployed built-in native tool executes through governed registry", () => {
  const registry = createNativeToolRegistry();
  const tool = registerNativeTool(registry, builtInTradingTools().find((x) => x.id === "native.rsi")!, "phase8.9-test");
  advanceNativeToolLifecycle(registry, tool.id, "tested");
  advanceNativeToolLifecycle(registry, tool.id, "approved");
  advanceNativeToolLifecycle(registry, tool.id, "deployed");
  const result = executeRegisteredNativeTool(registry, tool.id, { closes: Array.from({ length: 20 }, (_, i) => i + 1), period: 14 }) as { rsi: number };
  assert.equal(typeof result.rsi, "number");
});


test("native tool records persist through the registry store contract", async () => {
  const registry = createNativeToolRegistry();
  const record = registerNativeTool(registry, builtInTradingTools().find((x) => x.id === "native.atr")!, "phase8.9-test");
  const store = new InMemoryNativeToolRegistryStore();
  await store.upsert(record);
  const loaded = await store.get(record.id);
  assert.equal(loaded?.schemaHash, record.schemaHash);
  assert.equal((await store.list("proposed")).length, 1);
});


test("phase-8 native catalog and executable factory remain in parity", async () => {
  const { TOOL_SPECS } = await import("./catalog.ts");
  const nativeSpecs = TOOL_SPECS.filter((x) => x.name.startsWith("native."));
  const builtIns = builtInTradingTools();
  assert.deepEqual(nativeSpecs.map((x) => x.name).sort(), builtIns.map((x) => x.id).sort());
  assert.ok(builtIns.every((x) => x.safety.sandboxed && !x.safety.credentialsAllowed && !x.safety.walletAccess));
});

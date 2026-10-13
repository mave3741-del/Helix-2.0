import test from "node:test";
import assert from "node:assert/strict";
import { actionsFor, classifyJarvisIntent, jarvisPanelFor, JARVIS_AGENTS } from "./orchestrator-core.ts";

test("JARVIS has named command identities", () => {
  assert.equal(JARVIS_AGENTS[0]?.name, "Orion");
  assert.deepEqual(JARVIS_AGENTS.slice(1, 7).map((agent) => agent.name), ["Lyra", "Nova", "Atlas", "Polaris", "Nebula", "Titan"]);
  assert.deepEqual(JARVIS_AGENTS.slice(-3).map((agent) => agent.name), ["Astra", "Mira", "Selene"]);
});

test("JARVIS routes common owner intents to specialist identities", () => {
  assert.equal(classifyJarvisIntent("scan BTC and find opportunities").intent, "market_research");
  assert.equal(classifyJarvisIntent("show my risk and drawdown").agent.name, "Polaris");
  assert.equal(classifyJarvisIntent("latest news and sentiment").agent.name, "Nebula");
  assert.equal(classifyJarvisIntent("improve yourself and propose a fix").intent, "improvement");
  assert.equal(classifyJarvisIntent("debate this thesis").intent, "debate");
  assert.equal(classifyJarvisIntent("use NVIDIA NIM as the brain").intent, "brain_control");
});

test("JARVIS uses bounded council panels for high-impact research", () => {
  assert.deepEqual(jarvisPanelFor("risk_review"), ["Polaris", "Atlas", "Lyra"]);
  assert.deepEqual(jarvisPanelFor("market_research"), ["Nova", "Lyra", "Cassini"]);
  assert.deepEqual(jarvisPanelFor("news_sentiment"), ["Nebula", "Lyra", "Cassini"]);
  assert.deepEqual(jarvisPanelFor("portfolio_review"), ["Atlas", "Polaris", "Astra"]);
  assert.deepEqual(jarvisPanelFor("debate"), ["Lyra", "Nova", "Polaris"]);
});

test("JARVIS governance commands become explicit UI actions", () => {
  const actions = actionsFor({ text: "pause HELIX and force local only", intent: "governance_control", agent: JARVIS_AGENTS[4]! });
  assert.ok(actions.some((a) => a.type === "pause"));
  assert.ok(actions.some((a) => a.type === "set_routing" && a.mode === "local-only"));
  assert.ok(actions.some((a) => a.type === "select_agent" && a.agent === "Polaris"));
});

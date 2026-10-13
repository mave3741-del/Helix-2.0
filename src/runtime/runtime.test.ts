import assert from "node:assert/strict";
import test from "node:test";
import { seedOrganization } from "../org/seed.ts";
import { issueObjective, tick } from "../org/engine.ts";
import { scopedMemory } from "./memory/firewall.ts";
import { executeLocalWorker } from "./worker/kernel.ts";
import { exportWorkerPackage } from "./migrate.ts";
import { runTool, toolsForPermissions } from "./tools/runtime.ts";

test("exactly 1000 persistent worker identities", () => {
  const org = seedOrganization();
  assert.equal(org.workerOrder.length, 1000);
  const ids = new Set(org.workerOrder);
  assert.equal(ids.size, 1000);
  assert.ok(org.workerOrder[0] === "W-0001");
  assert.ok(org.workerOrder[999] === "W-1000");
  for (const id of org.workerOrder) {
    const w = org.workers[id];
    assert.ok(w.agent.registryId.startsWith("WORKER-"));
    assert.ok(w.agent.specialization.length > 0);
    assert.ok(w.agent.methodology.length > 0);
  }
});

test("workers are not identical copies", () => {
  const org = seedOrganization();
  const specs = new Set(org.workerOrder.map((id) => org.workers[id].agent.specialization));
  assert.ok(specs.size > 8);
  const styles = new Set(org.workerOrder.map((id) => org.workers[id].agent.style));
  assert.equal(styles.size, 5);
});

test("context firewall hides other-worker memory", () => {
  const org = seedOrganization();
  const worker = org.workers["W-0100"];
  org.memory.push({
    id: "secret-w",
    layer: "worker",
    ownerId: "W-0002",
    title: "private note",
    content: "should not leak",
    status: "verified",
    claim: "verified_fact",
    tags: ["research"],
    evidence: [],
    createdBy: "W-0002",
    createdAt: Date.now(),
    relatedSkillId: null,
    relatedTaskId: null,
  });
  const hits = scopedMemory(org, worker, "research", 8);
  assert.equal(hits.some((m) => m.id === "secret-w"), false);
});

test("local worker kernel produces evidence and does not self-certify as verified_fact", () => {
  const org = seedOrganization();
  const oid = issueObjective(org, "Prepare a one-page research brief on token-efficient memory.");
  tick(org, 8);
  const task = Object.values(org.tasks).find((t) => t.objectiveId === oid && t.workerId);
  assert.ok(task);
  if (task && task.workerId) {
    const w = org.workers[task.workerId];
    const turn = executeLocalWorker(org, w, task);
    assert.ok(turn.output.length > 40);
    assert.notEqual(turn.claim, "verified_fact");
    assert.ok(turn.evidence.length > 0);
    assert.ok(turn.trace.length > 0);
  }
});

test("calculator tool is sandboxed", () => {
  const allowed = toolsForPermissions(["editor"]);
  const ok = runTool({ name: "calculator", input: "2+2*3" }, { memory: [], allowed });
  assert.equal(ok.output, "8");
  const denied = runTool({ name: "calculator", input: "1" }, { memory: [], allowed: ["refuse"] });
  assert.equal(denied.ok, false);
});

test("worker package export is independently readable", () => {
  const org = seedOrganization();
  const pack = exportWorkerPackage(org.workers["W-0200"]);
  assert.equal(pack.identity.registryId, "WORKER-0200");
  assert.ok(pack.specialization);
  assert.ok(Array.isArray(pack.tools));
});

test("local-only routing never marks live pending", async () => {
  const { setRoutingMode, issueObjective, tick } = await import("../org/engine.ts");
  const org = seedOrganization();
  setRoutingMode(org, "local-only");
  const oid = issueObjective(org, "Reformat the internal department codes list and run a non-destructive self-check.");
  tick(org, 12);
  const live = Object.values(org.tasks).filter((t) => t.objectiveId === oid && t.livePending);
  assert.equal(live.length, 0);
});

test("fibonacci sandbox actually runs tests", async () => {
  const { runFibonacciProject } = await import("./tools/sandbox.ts");
  const result = await runFibonacciProject();
  assert.equal(result.ok, true, result.stderr || result.stdout);
  assert.equal(result.evidence, "code-run-pass");
  assert.match(result.stdout, /passed/);
});

test("fast trading path rejects stale data and emits deterministic signals without LLM calls", async () => {
  const { emitFastSignal, canPassFastRisk, totalFastPathBudgetMs } = await import("../trading/latency.ts");
  const now = Date.now();
  const tick = { symbol: "BTCUSDT", venue: "demo", market: "crypto" as const, bid: 100, ask: 100.01, last: 100.01, bidSize: 900, askSize: 100, sequence: 1, exchangeTs: now - 5, receivedTs: now };
  const signal = emitFastSignal(tick, now);
  assert.equal(signal.side, "buy");
  assert.ok(signal.strength > 0);
  assert.ok(totalFastPathBudgetMs() <= 10);
  assert.equal(canPassFastRisk(1000, signal, { dailyCapitalLimit: 10000, allocatedCapital: 0, maxPositionNotional: 5000, maxPortfolioDrawdown: 0.05, killSwitch: false, staleAfterMs: 50 }, tick, now), true);
  const stale = emitFastSignal({ ...tick, exchangeTs: now - 1000 }, now);
  assert.equal(stale.side, "flat");
});

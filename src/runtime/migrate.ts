import { BRAIN_SEED } from "@/org/catalog";
import { SCENARIO_DEFS } from "@/org/scenarios";
import type { OrgSnapshot, Worker } from "@/org/types";
import { ensureAgent } from "@/runtime/worker/profile";

export function migrateSnapshot(state: OrgSnapshot): OrgSnapshot {
  if (!state.kpis) return state;
  state.kpis.liveTurns ??= 0;
  state.kpis.localTurns ??= 0;
  state.kpis.unknowns ??= 0;
  if (!state.runtime) {
    state.runtime = {
      liveMode: false,
      liveInflight: 0,
      liveCap: 4,
      mode: "sandbox",
      isolated: [],
      routingMode: "local-only",
      toolRuns: 0,
    };
  }
  state.runtime.routingMode ??= state.runtime.liveMode ? "auto" : "local-only";
  state.runtime.toolRuns ??= 0;
  for (const id of state.workerOrder ?? []) {
    const w = state.workers[id];
    if (w) ensureAgent(w);
  }
  for (const t of Object.values(state.tasks ?? {})) {
    t.executionSource ??= "pending";
    t.livePending ??= false;
    t.trace ??= [];
    t.unknowns ??= [];
    t.priorityBand ??= "normal";
    t.checkpoint ??= null;
  }
  const have = new Set(state.brains.map((b) => b.id));
  for (const b of BRAIN_SEED) {
    if (!have.has(b.id)) state.brains.push({ ...b });
    else {
      const cur = state.brains.find((x) => x.id === b.id)!;
      cur.costClass ??= b.costClass;
      cur.privacy ??= b.privacy;
      cur.fallbackRank ??= b.fallbackRank;
      cur.health ??= b.available ? "up" : "down";
      cur.lastError ??= null;
      cur.consecutiveFails ??= 0;
      cur.contextWindow ??= b.contextWindow;
    }
  }
  for (const s of state.skills) {
    s.inputs ??= ["task", "context"];
    s.outputs ??= ["artifact", "evidence"];
  }
  for (const d of SCENARIO_DEFS) {
    if (!state.scenarios.some((s) => s.id === d.id)) {
      state.scenarios.push({ id: d.id, name: d.name, status: "idle", log: [], ranAt: null });
    }
  }
  state.version = 2;
  return state;
}

export function exportWorkerPackage(worker: Worker) {
  return {
    identity: { id: worker.id, registryId: worker.agent.registryId, name: worker.name, title: worker.title },
    role: worker.role,
    departmentId: worker.departmentId,
    chain: { supervisor: worker.supervisorId, manager: worker.managerId, executive: worker.executiveId },
    specialization: worker.agent.specialization,
    methodology: worker.agent.methodology,
    policyVersion: worker.agent.policyVersion,
    skills: worker.capabilities,
    tools: worker.toolPermissions,
    permissions: worker.permissions,
    memoryScope: worker.memoryScope,
    model: { preferred: worker.agent.brainPreference, current: worker.modelId },
    performance: worker.performance,
    health: worker.agent.health,
    tests: { qualityThreshold: worker.agent.qualityThreshold },
  };
}

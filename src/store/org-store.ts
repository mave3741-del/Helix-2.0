import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import {
  disableSkill,
  disableWorker,
  emergencyShutdown,
  grantApproval,
  isolate,
  issueObjective,
  reconcilePlan,
  setBrainAvailable,
  setLiveMode,
  setOrgStatus,
  setRoutingMode,
  tick,
} from "@/org/engine";
import { idbStorage } from "@/org/persist";
import { runScenario } from "@/org/run-scenario";
import { seedOrganization } from "@/org/seed";
import { migrateSnapshot } from "@/runtime/migrate";
import { applyLiveText } from "@/runtime/worker/kernel";
import type { FaultState, OrgSnapshot, RoutingMode } from "@/org/types";

export type ViewId =
  | "command"
  | "organization"
  | "workforce"
  | "work"
  | "quality"
  | "brains"
  | "skills"
  | "memory"
  | "governance"
  | "improve"
  | "scenarios"
  | "tools";

type OrgStore = OrgSnapshot & {
  hydrated: boolean;
  view: ViewId;
  selectedWorkerId: string | null;
  selectedTaskId: string | null;
  planning: boolean;
  planError: string | null;
  setHydrated: () => void;
  setView: (v: ViewId) => void;
  selectWorker: (id: string | null) => void;
  selectTask: (id: string | null) => void;
  tick: (steps?: number) => void;
  issue: (text: string, priority?: number) => string;
  applyCeoPlan: (
    objectiveId: string,
    plan: {
      strategy: string;
      departments: string[];
      skillGaps: string[];
      tasks?: { title: string; department: string; capability: string; risk?: "low" | "medium" | "high" | "critical" }[];
      risk: "low" | "medium" | "high" | "critical";
    },
  ) => void;
  setPlanning: (v: boolean, error?: string | null) => void;
  approve: (id: string, grant: boolean) => void;
  pause: () => void;
  resume: () => void;
  shutdown: () => void;
  recover: () => void;
  disableWorker: (id: string, reason: string) => void;
  disableSkill: (id: string) => void;
  toggleBrain: (id: string, available: boolean) => void;
  injectFault: (patch: Partial<FaultState>) => void;
  runScenario: (id: string) => void;
  resetOrg: () => void;
  setMission: (mission: string) => void;
  setOwnerName: (name: string) => void;
  setLive: (on: boolean) => void;
  setRouting: (mode: RoutingMode) => void;
  recordTool: (ok: boolean, evidence: string, output: string, taskId?: string) => void;
  isolate: (kind: "worker" | "department" | "team" | "task" | "tool" | "skill" | "provider", id: string) => void;
  beginLive: () => void;
  applyLive: (taskId: string, text: string, brainId: string, tokens: number) => void;
  failLive: (taskId: string) => void;
};

const seeded = seedOrganization();

export const useOrgStore = create<OrgStore>()(
  persist(
    (set, get) => ({
      ...seeded,
      hydrated: true,
      view: "command",
      selectedWorkerId: null,
      selectedTaskId: null,
      planning: false,
      planError: null,
      setHydrated: () => set({ hydrated: true }),
      setView: (view) => set({ view }),
      selectWorker: (selectedWorkerId) => set({ selectedWorkerId }),
      selectTask: (selectedTaskId) => set({ selectedTaskId }),
      tick: (steps = 1) =>
        set((s) => {
          if (s.orgStatus !== "running") return s;
          tick(s, steps);
          return { epoch: s.epoch, kpis: s.kpis, deptStats: s.deptStats, lastTickAt: s.lastTickAt };
        }),
      issue: (text, priority = 3) => {
        let id = "";
        set((s) => {
          id = issueObjective(s, text, priority);
          return {
            epoch: s.epoch + 1,
            ceo: { ...s.ceo },
            objectives: s.objectives,
            projects: s.projects,
            events: s.events,
            tasks: s.tasks,
            taskOrder: s.taskOrder,
            approvals: s.approvals,
            skills: s.skills,
            kpis: s.kpis,
            deptStats: s.deptStats,
          };
        });
        return id;
      },
      applyCeoPlan: (objectiveId, plan) =>
        set((s) => {
          reconcilePlan(s, objectiveId, plan);
          return { epoch: s.epoch + 1 };
        }),
      setPlanning: (planning, planError = null) => set({ planning, planError }),
      approve: (id, grant) =>
        set((s) => {
          grantApproval(s, id, grant);
          return { epoch: s.epoch + 1 };
        }),
      pause: () =>
        set((s) => {
          setOrgStatus(s, "paused");
          return { orgStatus: s.orgStatus, epoch: s.epoch + 1 };
        }),
      resume: () =>
        set((s) => {
          setOrgStatus(s, "running");
          return { orgStatus: s.orgStatus, epoch: s.epoch + 1 };
        }),
      shutdown: () =>
        set((s) => {
          emergencyShutdown(s);
          return { orgStatus: s.orgStatus, epoch: s.epoch + 1 };
        }),
      recover: () =>
        set((s) => {
          setOrgStatus(s, "recovering");
          return { orgStatus: s.orgStatus, epoch: s.epoch + 1 };
        }),
      disableWorker: (id, reason) =>
        set((s) => {
          disableWorker(s, id, reason);
          return { epoch: s.epoch + 1 };
        }),
      disableSkill: (id) =>
        set((s) => {
          disableSkill(s, id);
          return { epoch: s.epoch + 1 };
        }),
      toggleBrain: (id, available) =>
        set((s) => {
          setBrainAvailable(s, id, available);
          return { epoch: s.epoch + 1 };
        }),
      injectFault: (patch) =>
        set((s) => {
          s.faults = { ...s.faults, ...patch };
          return { faults: s.faults, epoch: s.epoch + 1 };
        }),
      runScenario: (id) =>
        set((s) => {
          runScenario(s, id);
          return { epoch: s.epoch + 1, scenarios: s.scenarios };
        }),
      resetOrg: () => {
        const next = seedOrganization();
        set({
          ...next,
          hydrated: true,
          view: get().view,
          selectedWorkerId: null,
          selectedTaskId: null,
          planning: false,
          planError: null,
        });
      },
      setMission: (mission) =>
        set((s) => ({ identity: { ...s.identity, mission }, epoch: s.epoch + 1 })),
      setOwnerName: (ownerName) =>
        set((s) => ({ identity: { ...s.identity, ownerName }, epoch: s.epoch + 1 })),
      setLive: (_on) =>
        set((s) => {
          // Current HELIX release keeps live execution structurally disabled.
          setLiveMode(s, false);
          return { runtime: { ...s.runtime }, epoch: s.epoch + 1 };
        }),
      setRouting: (mode) =>
        set((s) => {
          setRoutingMode(s, mode);
          return { runtime: { ...s.runtime }, epoch: s.epoch + 1 };
        }),
      recordTool: (ok, evidence, output, taskId) =>
        set((s) => {
          s.runtime.toolRuns = (s.runtime.toolRuns ?? 0) + 1;
          if (taskId && s.tasks[taskId]) {
            const task = s.tasks[taskId];
            task.evidence = [...task.evidence, evidence];
            task.trace = [...(task.trace ?? []), `tool ${evidence}: ${output.slice(0, 160)}`].slice(-24);
            task.checkpoint = { step: "tool", at: Date.now(), note: evidence };
            if (ok && evidence === "code-run-pass") task.claim = "fact";
          }
          return { runtime: { ...s.runtime }, epoch: s.epoch + 1 };
        }),
      isolate: (kind, id) =>
        set((s) => {
          isolate(s, kind, id);
          return { epoch: s.epoch + 1, runtime: { ...s.runtime } };
        }),
      beginLive: () =>
        set((s) => {
          s.runtime.liveInflight = 1;
          return { runtime: { ...s.runtime } };
        }),
      applyLive: (taskId, text, brainId, tokens) =>
        set((s) => {
          const task = s.tasks[taskId];
          const worker = task?.workerId ? s.workers[task.workerId] : null;
          if (task && worker) applyLiveText(s, task, worker, text, brainId, tokens);
          s.runtime.liveInflight = 0;
          s.budgets.apiCalls += 1;
          return {
            epoch: s.epoch + 1,
            runtime: { ...s.runtime },
            kpis: s.kpis,
            budgets: { ...s.budgets },
          };
        }),
      failLive: (taskId) =>
        set((s) => {
          const task = s.tasks[taskId];
          if (task) {
            task.livePending = false;
            task.executionSource = "fallback";
            task.trace = [...(task.trace ?? []), "live brain failed — local kernel continues"];
          }
          s.runtime.liveInflight = 0;
          s.kpis.fallbacks += 1;
          return { epoch: s.epoch + 1, runtime: { ...s.runtime }, kpis: s.kpis };
        }),
    }),
    {
      name: "helix-org-os-v3",
      storage: createJSONStorage(() => idbStorage),
      skipHydration: true,
      partialize: (s) => {
        const {
          hydrated: _h,
          view: _v,
          selectedWorkerId: _w,
          selectedTaskId: _t,
          planning: _p,
          planError: _e,
          setHydrated: _sh,
          setView: _sv,
          selectWorker: _sw,
          selectTask: _st,
          tick: _tick,
          issue: _issue,
          applyCeoPlan: _ac,
          setPlanning: _sp,
          approve: _ap,
          pause: _pa,
          resume: _re,
          shutdown: _sd,
          recover: _rc,
          disableWorker: _dw,
          disableSkill: _ds,
          toggleBrain: _tb,
          injectFault: _if,
          runScenario: _rs,
          resetOrg: _ro,
          setMission: _sm,
          setOwnerName: _so,
          setLive: _sl,
          setRouting: _sr,
          recordTool: _rt,
          isolate: _iso,
          beginLive: _bl,
          applyLive: _al,
          failLive: _fl,
          ...snap
        } = s;
        return snap;
      },
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        if (!state.workerOrder || state.workerOrder.length !== 1000) {
          const fresh = seedOrganization();
          Object.assign(state, fresh);
        } else {
          migrateSnapshot(state);
        }
        // Never rehydrate an old snapshot into live execution.
        if (state.runtime) state.runtime.liveMode = false;
        state.hydrated = true;
      },
    },
  ),
);

import { mulberry32, padId } from "@/lib/utils";
import { tradingProfile } from "@/trading/workforce";
import { makeAgent } from "@/runtime/worker/profile";

import {
  BRAIN_SEED,
  CAPABILITIES,
  DEPARTMENT_DEFS,
  EXEC_TITLES,
  FAMILY,
  GIVEN,
  SKILL_SEED,
} from "./catalog";
import type {
  AuditEntry,
  Brain,
  CeoState,
  Department,
  FaultState,
  Kpis,
  MemoryItem,
  OrgEvent,
  OrgSnapshot,
  PerformanceProfile,
  ScenarioResult,
  Skill,
  Team,
  Worker,
  WorkerRank,
  WorkerRole,
} from "./types";
import { SCENARIO_DEFS } from "./scenarios";

function perf(rand: () => number, bias = 0.86): PerformanceProfile {
  const quality = Math.min(0.99, Math.max(0.48, bias + (rand() - 0.5) * 0.12));
  const done = 8 + Math.floor(rand() * 40);
  const fail = Math.floor(rand() * 4);
  return {
    done,
    fail,
    qcFail: Math.floor(fail * 0.7),
    quality,
    reliability: Math.min(0.99, quality + 0.04),
    avgMs: 400 + Math.floor(rand() * 2400),
    tokens: Math.floor(rand() * 12000),
    corrections: Math.floor(rand() * 5),
    improved: Math.floor(rand() * 3),
    repeats: Math.floor(rand() * 2),
    toolAccuracy: Math.min(0.99, quality + 0.02),
    compliance: Math.min(0.99, 0.9 + rand() * 0.09),
    hallucinationFlags: 0,
    cost: 0,
  };
}

function pickCaps(role: WorkerRole, dept: string, rand: () => number): string[] {
  const base: Record<string, string[]> = {
    strategy: ["planning", "analysis", "writing"],
    engineering: ["coding", "integration", "performance"],
    research: ["research", "analysis", "writing"],
    quality: ["qc", "testing", "analysis"],
    security: ["security-review", "red-team"],
    operations: ["ops", "planning"],
    knowledge: ["documentation", "research"],
    skills: ["skill-design", "coding", "testing"],
    workforce: ["coaching", "planning"],
    governance: ["arbitration", "planning"],
    recovery: ["recovery", "ops"],
    routing: ["routing", "benchmarking"],
  };
  const caps = [...(base[dept] ?? ["analysis"])];
  if (role === "qc") caps.push("qc");
  if (role === "tester") caps.push("testing");
  if (role === "security") caps.push("security-review", "red-team");
  if (role === "recovery") caps.push("recovery");
  if (role === "specialist") {
    const extra = CAPABILITIES[Math.floor(rand() * CAPABILITIES.length)];
    if (!caps.includes(extra)) caps.push(extra);
  }
  return Array.from(new Set(caps)).slice(0, 4);
}

function permissionsFor(role: WorkerRole): string[] {
  switch (role) {
    case "executive":
      return ["org.read", "org.plan", "dept.write", "memory.read", "escalate"];
    case "manager":
      return ["dept.read", "dept.plan", "team.write", "memory.read", "escalate"];
    case "supervisor":
      return ["team.read", "task.assign", "qc.request", "memory.team"];
    case "qc":
      return ["qc.read", "qc.write", "memory.read"];
    case "tester":
      return ["test.run", "memory.read"];
    case "security":
      return ["security.probe", "security.review"];
    case "recovery":
      return ["recovery.run", "org.write"];
    default:
      return ["task.execute", "memory.worker", "skill.use"];
  }
}

function toolsFor(role: WorkerRole): string[] {
  if (role === "security") return ["linter", "scanner", "sandbox"];
  if (role === "tester") return ["sandbox", "runner"];
  if (role === "qc") return ["checklist", "diff"];
  if (role === "worker" || role === "specialist") return ["editor", "notes"];
  return ["notes"];
}

function rankFor(role: WorkerRole, i: number): WorkerRank {
  if (role === "executive") return "lead";
  if (role === "manager") return "expert";
  if (role === "supervisor") return i % 5 === 0 ? "expert" : "senior";
  if (i % 17 === 0) return "expert";
  if (i % 7 === 0) return "senior";
  if (i % 11 === 0) return "junior";
  return "standard";
}

function withAgent(w: Omit<Worker, "agent">): Worker {
  return { ...w, agent: makeAgent(w) };
}

function workerName(i: number): string {
  const a = GIVEN[i % GIVEN.length];
  const b = FAMILY[Math.floor(i / GIVEN.length) % FAMILY.length];
  return `${a} ${b}`;
}

function brainFor(role: WorkerRole, caps: string[], rand: () => number): string {
  if (role === "executive" || role === "manager") return "grok-4.5";
  if (caps.includes("coding")) return rand() > 0.4 ? "cloud-coder" : "grok-fast";
  if (caps.includes("research")) return rand() > 0.5 ? "open-reasoner" : "grok-fast";
  if (caps.includes("ops") || caps.includes("routing")) return "local-heuristic";
  return rand() > 0.7 ? "grok-fast" : "local-heuristic";
}

export function emptyFaults(): FaultState {
  return {
    modelFailure: false,
    providerFailure: false,
    networkFailure: false,
    toolFailure: false,
    workerFailureId: null,
    supervisorFailureId: null,
    corruptTask: false,
    timeout: false,
    rateLimit: false,
    badOutput: false,
    failedDeploy: false,
  };
}

export function emptyKpis(): Kpis {
  return {
    successRate: 0.94,
    quality: 0.91,
    reliability: 0.96,
    avgCompletionMs: 1800,
    tokenEfficiency: 0.82,
    delivered: 12,
    failed: 1,
    qcCatchRate: 0.88,
    activeWorkers: 0,
    availableWorkers: 1000,
    trainingWorkers: 0,
    fallbacks: 0,
    liveTurns: 0,
    localTurns: 0,
    unknowns: 0,
  };
}

export function seedOrganization(now = Date.now()): OrgSnapshot {
  const rand = mulberry32(1000);
  const workers: Record<string, Worker> = {};
  const workerOrder: string[] = [];
  const departments: Department[] = [];
  const teams: Team[] = [];

  const execIds: string[] = [];
  for (let i = 1; i <= 8; i++) {
    const id = `W-${padId(i)}`;
    execIds.push(id);
    const def = EXEC_TITLES[i - 1];
    const caps = pickCaps("executive", def.dept, rand);
    const trade = tradingProfile(i - 1);
    workers[id] = withAgent({
      id,
      name: workerName(i - 1),
      role: "executive",
      title: def.title,
      departmentId: def.dept,
      supervisorId: null,
      managerId: null,
      executiveId: id,
      capabilities: Array.from(new Set([...caps, ...trade.capabilities, "trading"])),
      permissions: permissionsFor("executive"),
      status: "available",
      currentAssignment: null,
      modelId: "grok-4.5",
      toolPermissions: toolsFor("executive"),
      memoryScope: "org",
      rank: "lead",
      performance: perf(rand, 0.93),
      teamId: null,
      specialist: true,
      reserved: false,
      disabledReason: null,
      lastActiveAt: now,
    });
    workers[id].agent.specialization = trade.name;
    workers[id].agent.methodology = trade.methods;
    workers[id].agent.lastTrace = `Trading specialization: ${trade.name}`;
    workerOrder.push(id);
  }

  const managerIds: string[] = [];
  DEPARTMENT_DEFS.forEach((d, idx) => {
    const id = `W-${padId(9 + idx)}`;
    managerIds.push(id);
    const execId = execIds.find((e) => workers[e].departmentId === d.id) ?? execIds[idx % 8];
    const trade = tradingProfile(8 + idx);
    const caps = pickCaps("manager", d.id, rand);
    workers[id] = withAgent({
      id,
      name: workerName(8 + idx),
      role: "manager",
      title: `Manager, ${d.name}`,
      departmentId: d.id,
      supervisorId: null,
      managerId: id,
      executiveId: execId,
      capabilities: Array.from(new Set([...caps, ...trade.capabilities, "trading"])),
      permissions: permissionsFor("manager"),
      status: "available",
      currentAssignment: null,
      modelId: "grok-4.5",
      toolPermissions: toolsFor("manager"),
      memoryScope: "department",
      rank: "expert",
      performance: perf(rand, 0.91),
      teamId: null,
      specialist: true,
      reserved: false,
      disabledReason: null,
      lastActiveAt: now,
    });
    workers[id].agent.specialization = trade.name;
    workers[id].agent.methodology = trade.methods;
    workers[id].agent.lastTrace = `Trading specialization: ${trade.name}`;
    workerOrder.push(id);
  });

  const supervisorIds: string[] = [];
  let cursor = 21;
  DEPARTMENT_DEFS.forEach((d, di) => {
    const deptSup: string[] = [];
    for (let t = 0; t < 4; t++) {
      const id = `W-${padId(cursor++)}`;
      deptSup.push(id);
      supervisorIds.push(id);
      const trade = tradingProfile(20 + di * 4 + t);
      const caps = pickCaps("supervisor", d.id, rand);
      workers[id] = withAgent({
        id,
        name: workerName(20 + di * 4 + t),
        role: "supervisor",
        title: `Supervisor, ${d.code}-${t + 1}`,
        departmentId: d.id,
        supervisorId: id,
        managerId: managerIds[di],
        executiveId: workers[managerIds[di]].executiveId,
        capabilities: Array.from(new Set([...caps, ...trade.capabilities, "trading"])),
        permissions: permissionsFor("supervisor"),
        status: "available",
        currentAssignment: null,
        modelId: "grok-fast",
        toolPermissions: toolsFor("supervisor"),
        memoryScope: "team",
        rank: rankFor("supervisor", t),
        performance: perf(rand, 0.88),
        teamId: `T-${d.code}-${t + 1}`,
        specialist: false,
        reserved: false,
        disabledReason: null,
        lastActiveAt: now,
      });
      workers[id].agent.specialization = trade.name;
      workers[id].agent.methodology = trade.methods;
      workers[id].agent.lastTrace = `Trading specialization: ${trade.name}`;
      workerOrder.push(id);
    }
    departments.push({
      id: d.id,
      name: d.name,
      code: d.code,
      purpose: d.purpose,
      executiveId: workers[managerIds[di]].executiveId!,
      managerId: managerIds[di],
      supervisorIds: deptSup,
    });
  });

  const remaining = 1000 - 68;
  const teamBuckets: string[][] = supervisorIds.map(() => []);
  for (let n = 0; n < remaining; n++) {
    const i = 69 + n;
    const id = `W-${padId(i)}`;
    const supIndex = n % supervisorIds.length;
    const supervisorId = supervisorIds[supIndex];
    const supervisor = workers[supervisorId];
    const dept = supervisor.departmentId;

    let role: WorkerRole = "worker";
    if (n % 13 === 0) role = "qc";
    else if (n % 17 === 0) role = "tester";
    else if (n % 23 === 0) role = "security";
    else if (n % 29 === 0) role = "recovery";
    else if (n % 11 === 0) role = "specialist";
    else if (n % 19 === 0) role = "analyst";
    if (dept === "quality" && n % 3 === 0) role = "qc";
    if (dept === "quality" && n % 3 === 1) role = "tester";
    if (dept === "security" && n % 2 === 0) role = "security";
    if (dept === "recovery" && n % 2 === 0) role = "recovery";

    const weak = n % 41 === 0;
    const reserved = n % 53 === 0;
    const trade = tradingProfile(n + 68);
    const caps = pickCaps(role, dept, rand);
    const title =
      role === "qc"
        ? `QC Agent, ${departments.find((d) => d.id === dept)?.code}`
        : role === "tester"
          ? `Tester, ${departments.find((d) => d.id === dept)?.code}`
          : role === "security"
            ? `Security Reviewer`
            : role === "recovery"
              ? `Recovery Agent`
              : role === "specialist"
                ? `Specialist, ${caps[0]}`
                : role === "analyst"
                  ? `Analyst`
                  : `Worker`;

    workers[id] = withAgent({
      id,
      name: workerName(i - 1),
      role,
      title,
      departmentId: dept,
      supervisorId,
      managerId: supervisor.managerId,
      executiveId: supervisor.executiveId,
      capabilities: Array.from(new Set([...caps, ...trade.capabilities, "trading"])),
      permissions: permissionsFor(role),
      status: reserved ? "reserved" : "available",
      currentAssignment: null,
      modelId: brainFor(role, caps, rand),
      toolPermissions: toolsFor(role),
      memoryScope: "worker",
      rank: rankFor(role, n),
      performance: perf(rand, weak ? 0.58 : 0.86),
      teamId: supervisor.teamId,
      specialist: role === "specialist" || role === "qc" || role === "tester",
      reserved,
      disabledReason: null,
      lastActiveAt: now,
    });
    workers[id].agent.specialization = trade.name;
    workers[id].agent.methodology = trade.methods;
    workers[id].agent.lastTrace = `Trading specialization: ${trade.name}`;
    workerOrder.push(id);
    teamBuckets[supIndex].push(id);
  }

  supervisorIds.forEach((sid, idx) => {
    const sup = workers[sid];
    const members = teamBuckets[idx];
    const qcId = members.find((id) => workers[id].role === "qc") ?? null;
    const testerId = members.find((id) => workers[id].role === "tester") ?? null;
    teams.push({
      id: sup.teamId!,
      departmentId: sup.departmentId,
      supervisorId: sid,
      name: sup.title.replace("Supervisor, ", "Team "),
      workerIds: members,
      qcId,
      testerId,
    });
  });

  const skills: Skill[] = SKILL_SEED.map((s, i) => ({
    ...s,
    inputs: ["task", "scoped-memory", "skill-spec"],
    outputs: ["artifact", "evidence", "claim-status"],
    creatorId: managerIds[i % managerIds.length],
    reviewerId: execIds[i % execIds.length],
    changeHistory: [
      { at: now - 86400000 * (8 - i), by: execIds[i % execIds.length], note: "Production certified" },
    ],
  }));

  const brains: Brain[] = BRAIN_SEED.map((b) => ({
    ...b,
    tokensUsed: Math.floor(rand() * 40000),
    tasks: 10 + Math.floor(rand() * 40),
  }));

  const memory: MemoryItem[] = [
    {
      id: "mem-boot-1",
      layer: "org",
      ownerId: "ORG",
      title: "Operating layer bootstrap",
      content:
        "The organization stood up 12 departments, 48 teams, and 1,000 persistent worker identities. Models are replaceable; memory is not.",
      status: "verified",
      claim: "verified_fact",
      tags: ["bootstrap", "identity"],
      evidence: ["workforce-registry", "constitution"],
      createdBy: "ORG-CEO",
      createdAt: now - 3600000,
      relatedSkillId: null,
      relatedTaskId: null,
    },
    {
      id: "mem-boot-2",
      layer: "org",
      ownerId: "ORG",
      title: "Quality is independent of the author",
      content:
        "A worker's own brain cannot be the sole judge of its work. QC agents use a different model assignment and a separate checklist.",
      status: "verified",
      claim: "verified_fact",
      tags: ["qc", "constitution"],
      evidence: ["sk-qc-review"],
      createdBy: departments.find((d) => d.id === "quality")!.managerId,
      createdAt: now - 3400000,
      relatedSkillId: "sk-qc-review",
      relatedTaskId: null,
    },
    {
      id: "mem-pitfall-1",
      layer: "org",
      ownerId: "ORG",
      title: "Rejected: treating draft output as organizational truth",
      content: "Unverified model text was proposed as policy. Rejected by governance. Status remains rejected.",
      status: "rejected",
      claim: "error",
      tags: ["pitfall", "governance"],
      evidence: ["constitution-5"],
      createdBy: departments.find((d) => d.id === "governance")!.managerId,
      createdAt: now - 3200000,
      relatedSkillId: null,
      relatedTaskId: null,
    },
  ];

  const ceo: CeoState = {
    id: "ORG-CEO",
    name: "Orion",
    status: "idle",
    modelId: "grok-4.5",
    lastBrief:
      "Trading organization is operational. 1,000 specialized workers registered across a shared trading mission. Research, risk, quality and fallback gates armed. Paper-trading phase ready.",
    advisors: execIds.slice(0, 4),
  };

  const deptStats: OrgSnapshot["deptStats"] = {};
  for (const d of departments) {
    const ids = workerOrder.filter((id) => workers[id].departmentId === d.id);
    deptStats[d.id] = {
      active: 0,
      available: ids.filter((id) => workers[id].status === "available").length,
      queue: 0,
      quality:
        ids.reduce((a, id) => a + workers[id].performance.quality, 0) / Math.max(1, ids.length),
      failRate: 0.04,
    };
  }

  const events: OrgEvent[] = [
    {
      id: "ev-boot-1",
      type: "ORG_RECOVERED",
      at: now - 4000000,
      who: "ORG-CEO",
      what: "Operating layer initialized",
      why: "First boot of organizational identity",
      taskId: null,
      modelId: "local-heuristic",
      result: "1,000 trading workers, 12 departments, trading constitution sealed",
    },
    {
      id: "ev-boot-2",
      type: "SKILL_DEPLOYED",
      at: now - 3800000,
      who: departments.find((d) => d.id === "skills")!.managerId,
      what: "Core skill catalog certified",
      why: "Testing grounds passed",
      taskId: null,
      modelId: "cloud-coder",
      result: `${skills.length} production skills`,
    },
    {
      id: "ev-boot-3",
      type: "STRATEGY_SET",
      at: now - 3600000,
      who: "ORG-CEO",
      what: "Standby posture",
      why: "Awaiting Owner direction",
      taskId: null,
      modelId: "grok-4.5",
      result: "idle",
    },
  ];

  const audit: AuditEntry[] = events.map((e, i) => ({
    id: `aud-${i + 1}`,
    at: e.at,
    who: e.who,
    what: e.what,
    why: e.why,
    taskId: null,
    modelId: e.modelId,
    tool: null,
    result: e.result,
    test: "pass",
    qc: "pass",
    approval: "n/a",
  }));

  const scenarios: ScenarioResult[] = SCENARIO_DEFS.map((s) => ({
    id: s.id,
    name: s.name,
    status: "idle",
    log: [],
    ranAt: null,
  }));

  if (workerOrder.length !== 1000) {
    throw new Error(`Helix invariant failed: ${workerOrder.length} workers, expected 1000`);
  }

  return {
    version: 2,
    identity: {
      name: "Helix 2.0",
      mission:
        "Execute Owner objectives through one organization: coordinated departments, verified work, replaceable brains, and durable memory.",
      ownerName: "Owner",
      foundedAt: now,
    },
    orgStatus: "running",
    workers,
    workerOrder,
    departments,
    teams,
    brains,
    skills,
    memory,
    tasks: {},
    taskOrder: [],
    projects: [],
    objectives: [],
    events,
    audit,
    messages: [],
    approvals: [],
    improvements: [],
    ceo,
    kpis: emptyKpis(),
    deptStats,
    scenarios,
    faults: emptyFaults(),
    budgets: { tokens: 0, tokenCap: 250000, apiCalls: 0, apiCap: 40 },
    runtime: {
      liveMode: false,
      liveInflight: 0,
      liveCap: 4,
      mode: "sandbox",
      isolated: [],
      routingMode: "local-only",
      toolRuns: 0,
    },
    tickMs: 420,
    epoch: 1,
    lastTickAt: now,
    bootstrappedAt: now,
  };
}

export function workerCount(snap: OrgSnapshot) {
  return snap.workerOrder.length;
}

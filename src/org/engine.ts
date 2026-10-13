import { applyTurnToTask, executeLocalQc, executeLocalWorker } from "@/runtime/worker/kernel";
import { ensureAgent } from "@/runtime/worker/profile";
import { routeBrain } from "@/runtime/brain/router";
import { capabilityChain } from "@/runtime/brain/providers";
import { clamp, mulberry32, padId } from "@/lib/utils";
import { HIGH_RISK_TERMS, MEDIUM_RISK_TERMS } from "./catalog";
import { QUALITY_GATES } from "./constitution";
import type {
  Approval,
  AuditEntry,
  Brain,
  EventType,
  Improvement,
  MemoryItem,
  OrgEvent,
  OrgMessage,
  OrgSnapshot,
  Project,
  RiskLevel,
  Skill,
  Task,
  Worker,
} from "./types";

let seq = 100;

function nid(prefix: string) {
  seq += 1;
  return `${prefix}-${Date.now().toString(36)}-${seq}`;
}

function taskRuntimeFields(state: OrgSnapshot, priority: number): Pick<
  Task,
  "executionSource" | "livePending" | "trace" | "checkpoint" | "priorityBand" | "unknowns"
> {
  const band: Task["priorityBand"] =
    priority >= 5 ? "critical" : priority === 4 ? "high" : priority <= 1 ? "background" : "normal";
  return {
    executionSource: "pending",
    livePending: false,
    trace: ["created"],
    checkpoint: { step: "created", at: Date.now(), note: "queued" },
    priorityBand: band,
    unknowns: [],
  };
}

function pushCap<T>(arr: T[], item: T, max: number) {
  arr.push(item);
  if (arr.length > max) arr.splice(0, arr.length - max);
}

export function classifyRisk(text: string): RiskLevel {
  const t = text.toLowerCase();
  if (/\b(critical|destroy|wipe|exfiltrat|credential dump)\b/.test(t) && HIGH_RISK_TERMS.some((k) => t.includes(k)))
    return "critical";
  if (HIGH_RISK_TERMS.some((k) => t.includes(k))) return "high";
  if (MEDIUM_RISK_TERMS.some((k) => t.includes(k))) return "medium";
  return "low";
}

export function neededCapability(text: string): string {
  const t = text.toLowerCase();
  if (t.includes("redlin") || t.includes("multilingual") || t.includes("contract"))
    return "contract-redline";
  if (t.includes("code") || t.includes("build") || t.includes("implement") || t.includes("engineer"))
    return "coding";
  if (t.includes("test") || t.includes("qa") || t.includes("quality")) return "testing";
  if (t.includes("security") || t.includes("red team")) return "security-review";
  if (t.includes("recover") || t.includes("failover")) return "recovery";
  if (t.includes("rout") || t.includes("model") || t.includes("brain")) return "routing";
  if (t.includes("train") || t.includes("coach")) return "coaching";
  if (t.includes("research") || t.includes("brief") || t.includes("analy")) return "research";
  if (t.includes("document") || t.includes("memory") || t.includes("knowledge")) return "documentation";
  return "analysis";
}

function deptsFor(text: string, cap: string): string[] {
  const t = text.toLowerCase();
  const d = new Set<string>();
  if (cap === "research" || t.includes("brief")) d.add("research");
  if (cap === "coding" || t.includes("engineer") || t.includes("build")) d.add("engineering");
  if (cap === "testing" || t.includes("quality")) d.add("quality");
  if (cap === "security-review" || t.includes("security")) d.add("security");
  if (cap === "recovery") d.add("recovery");
  if (cap === "routing") d.add("routing");
  if (cap === "coaching") d.add("workforce");
  if (cap === "documentation" || t.includes("knowledge") || t.includes("memory")) d.add("knowledge");
  if (cap === "contract-redline") {
    d.add("skills");
    d.add("research");
    d.add("security");
    d.add("quality");
  }
  if (t.includes("cross") || t.includes("coordinat") || t.includes("launch") || t.includes("program")) {
    d.add("strategy");
    d.add("engineering");
    d.add("research");
    d.add("quality");
    d.add("operations");
  }
  if (t.includes("routing policy")) {
    d.add("routing");
    d.add("research");
    d.add("engineering");
    d.add("security");
    d.add("quality");
  }
  if (d.size === 0) d.add("strategy");
  if (d.size > 1) d.add("operations");
  return Array.from(d);
}

export function selectBrain(state: OrgSnapshot, required: string, qualityNeed: number): Brain {
  return routeBrain(state, required, qualityNeed);
}

export function emit(
  state: OrgSnapshot,
  type: EventType,
  who: string,
  what: string,
  why: string,
  extra?: Partial<OrgEvent>,
) {
  const ev: OrgEvent = {
    id: nid("ev"),
    type,
    at: Date.now(),
    who,
    what,
    why,
    taskId: extra?.taskId ?? null,
    modelId: extra?.modelId ?? null,
    result: extra?.result ?? null,
  };
  pushCap(state.events, ev, 400);
  const aud: AuditEntry = {
    id: nid("aud"),
    at: ev.at,
    who,
    what,
    why,
    taskId: ev.taskId,
    modelId: ev.modelId,
    tool: null,
    result: ev.result,
    test: extra?.type === "TEST_PASSED" ? "pass" : extra?.type === "TEST_FAILED" ? "fail" : null,
    qc: extra?.type === "QC_PASSED" ? "pass" : extra?.type === "QC_FAILED" ? "fail" : null,
    approval: null,
  };
  pushCap(state.audit, aud, 1500);
  return ev;
}

function message(
  state: OrgSnapshot,
  from: string,
  to: string,
  kind: OrgMessage["kind"],
  body: string,
  taskId: string | null,
) {
  pushCap(
    state.messages,
    { id: nid("msg"), at: Date.now(), from, to, kind, body, taskId },
    300,
  );
}

function skillForCap(state: OrgSnapshot, cap: string): Skill | undefined {
  return state.skills.find(
    (s) =>
      s.deploymentStatus === "production" &&
      (s.capabilities.includes(cap) || s.id.includes(cap)),
  );
}

function hasSkillGap(state: OrgSnapshot, cap: string): boolean {
  if (cap === "contract-redline") {
    return !state.skills.some(
      (s) => s.capabilities.includes("contract-redline") && s.deploymentStatus === "production",
    );
  }
  return !skillForCap(state, cap);
}

export interface PlanInput {
  // Not read by applyPlan/reconcilePlan (they derive text from the
  // objective itself), but kept optional so callers that only have a
  // strategy/task breakdown on hand aren't forced to fabricate one.
  text?: string;
  strategy?: string;
  departments?: string[];
  tasks?: { title: string; department: string; capability: string; risk?: RiskLevel }[];
  skillGaps?: string[];
  risk?: RiskLevel;
}

export function applyPlan(state: OrgSnapshot, objectiveId: string, plan: PlanInput) {
  const obj = state.objectives.find((o) => o.id === objectiveId);
  if (!obj) return;
  const risk = plan.risk ?? obj.risk;
  const cap = neededCapability(obj.text);
  const deptIds = plan.departments?.length ? plan.departments : deptsFor(obj.text, cap);
  obj.strategy = plan.strategy ?? localStrategy(obj.text, deptIds);
  obj.status = risk === "high" || risk === "critical" ? "awaiting_approval" : "active";
  state.ceo.status = "directing";
  state.ceo.lastBrief = obj.strategy;

  const project: Project = {
    id: nid("prj"),
    objectiveId: obj.id,
    name: obj.text.slice(0, 72),
    summary: obj.strategy.slice(0, 220),
    departmentIds: deptIds,
    status: risk === "high" || risk === "critical" ? "awaiting_approval" : "active",
    risk,
    progress: 0,
    createdAt: Date.now(),
  };
  state.projects.unshift(project);
  emit(state, "PROJECT_CREATED", "ORG-CEO", project.name, "Orion strategy accepted", {
    result: deptIds.join(","),
  });

  const gaps = plan.skillGaps ?? (hasSkillGap(state, cap) ? [cap] : []);
  for (const g of gaps) startSkillFactory(state, g, project.id, obj.id);

  const specs =
    plan.tasks && plan.tasks.length
      ? plan.tasks
      : deptIds.map((d) => ({
          title: `${state.departments.find((x) => x.id === d)?.name ?? d}: ${obj.text.slice(0, 48)}`,
          department: d,
          capability: capForDept(d, cap),
          risk,
        }));

  const created: Task[] = [];
  specs.forEach((spec, i) => {
    const dept = state.departments.find((d) => d.id === spec.department);
    if (!dept) return;
    const brain = selectBrain(state, spec.capability, 0.8);
    const skill = skillForCap(state, spec.capability);
    const task: Task = {
      id: nid("tsk"),
      projectId: project.id,
      objectiveId: obj.id,
      title: spec.title,
      description: contextPacket(obj.text, spec.title, spec.capability, skill?.id ?? null),
      departmentId: spec.department,
      supervisorId: dept.supervisorIds[i % dept.supervisorIds.length],
      workerId: null,
      qcId: null,
      testerId: null,
      owner: "supervisor",
      status: risk === "high" || risk === "critical" ? "awaiting_approval" : "queued",
      priority: obj.priority,
      urgency: 3,
      importance: 4,
      risk: spec.risk ?? risk,
      skillId: skill?.id ?? null,
      requiredCapability: spec.capability,
      brainId: brain.id,
      fallbacks: capabilityChain(spec.capability).filter((id) => id !== brain.id),
      dependencies: i === 0 ? [] : created[i - 1] ? [created[i - 1].id] : [],
      progress: 0,
      plan: `Execute ${spec.capability} under ${dept.name} with independent QC.`,
      output: "",
      evidence: [],
      failures: [],
      corrections: 0,
      tests: [
        { name: "unit", result: "pending" },
        { name: "requirement", result: "pending" },
        { name: "edge-case", result: "pending" },
      ],
      qcVerdict: null,
      qcNotes: "",
      approval: risk === "high" || risk === "critical" ? "pending" : "not_required",
      lessons: [],
      locked: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      deadline: Date.now() + 1000 * 60 * 20,
      tokenUsed: 0,
      gate: 0,
      claim: "unverified_claim",
      ...taskRuntimeFields(state, obj.priority),
    };
    created.push(task);
    state.tasks[task.id] = task;
    state.taskOrder.unshift(task.id);
    emit(state, "TASK_CREATED", "ORG-CEO", task.title, "Decomposed from Orion strategy", {
      taskId: task.id,
      modelId: brain.id,
    });
  });

  if (risk === "high" || risk === "critical") {
    const appr: Approval = {
      id: nid("apr"),
      at: Date.now(),
      kind: "high_risk",
      title: "High-risk objective requires Owner approval",
      detail: obj.text,
      risk: "high",
      refId: obj.id,
      status: "pending",
    };
    state.approvals.unshift(appr);
    obj.requiresApproval = true;
    emit(state, "APPROVAL_REQUIRED", "ORG-CEO", appr.title, "Constitution rule 11", {
      result: obj.id,
    });
  }

  message(state, "ORG-CEO", deptIds[0] ?? "strategy", "request", obj.strategy, created[0]?.id ?? null);
}

export function reconcilePlan(state: OrgSnapshot, objectiveId: string, plan: PlanInput) {
  const obj = state.objectives.find((o) => o.id === objectiveId);
  if (!obj) return;
  const existing = state.projects.find((project) => project.objectiveId === objectiveId);
  if (!existing) {
    applyPlan(state, objectiveId, plan);
    return;
  }
  const risk = plan.risk ?? obj.risk;
  const cap = neededCapability(obj.text);
  const deptIds = plan.departments?.length ? plan.departments : existing.departmentIds;
  obj.strategy = plan.strategy ?? obj.strategy ?? localStrategy(obj.text, deptIds);
  obj.risk = risk;
  obj.status = risk === "high" || risk === "critical" ? "awaiting_approval" : "active";
  existing.departmentIds = [...deptIds];
  existing.summary = obj.strategy.slice(0, 220);
  existing.risk = risk;
  existing.status = obj.status === "awaiting_approval" ? "awaiting_approval" : "active";
  state.ceo.status = "directing";
  state.ceo.lastBrief = obj.strategy;

  const desired = plan.tasks?.length ? plan.tasks : deptIds.map((d) => ({
    title: `${state.departments.find((x) => x.id === d)?.name ?? d}: ${obj.text.slice(0, 48)}`,
    department: d,
    capability: capForDept(d, cap),
    risk,
  }));
  const existingTasks = Object.values(state.tasks).filter((task) => task.projectId === existing.id);
  const desiredSignatures = new Set(desired.map((spec) => `${spec.department}|${spec.capability}|${spec.title}`));
  for (const task of existingTasks) {
    const signature = `${task.departmentId}|${task.requiredCapability}|${task.title}`;
    if (!desiredSignatures.has(signature) && ["queued", "awaiting_approval", "planning"].includes(task.status)) {
      task.status = "cancelled";
      task.updatedAt = Date.now();
      emit(state, "TASK_CANCELLED", "ORG-CEO", task.title, "Removed by authoritative CEO reconciliation", { taskId: task.id, result: existing.id });
    }
  }
  const activeBySignature = new Set(Object.values(state.tasks).filter((task) => task.projectId === existing.id && !["done", "failed", "cancelled"].includes(task.status)).map((task) => `${task.departmentId}|${task.requiredCapability}|${task.title}`));
  let added = 0;
  for (const spec of desired) {
    const signature = `${spec.department}|${spec.capability}|${spec.title}`;
    if (activeBySignature.has(signature)) continue;
    const dept = state.departments.find((d) => d.id === spec.department);
    if (!dept) continue;
    const brain = selectBrain(state, spec.capability, 0.8);
    const skill = skillForCap(state, spec.capability);
    const task: Task = {
      id: nid("tsk"), projectId: existing.id, objectiveId: obj.id, title: spec.title,
      description: contextPacket(obj.text, spec.title, spec.capability, skill?.id ?? null),
      departmentId: spec.department, supervisorId: dept.supervisorIds[0] ?? "ORG-CEO", workerId: null, qcId: null, testerId: null,
      owner: "supervisor", status: risk === "high" || risk === "critical" ? "awaiting_approval" : "queued",
      priority: obj.priority, urgency: 3, importance: 4, risk: spec.risk ?? risk, skillId: skill?.id ?? null, requiredCapability: spec.capability, brainId: brain.id,
      fallbacks: capabilityChain(spec.capability).filter((id) => id !== brain.id), dependencies: [], progress: 0, plan: `Execute ${spec.capability} under ${dept.name} with independent QC.`, output: "", evidence: [], failures: [], corrections: 0,
      tests: [{ name: "unit", result: "pending" }, { name: "requirement", result: "pending" }, { name: "edge-case", result: "pending" }], qcVerdict: null, qcNotes: "", approval: risk === "high" || risk === "critical" ? "pending" : "not_required", lessons: [], locked: false, createdAt: Date.now(), updatedAt: Date.now(), deadline: Date.now() + 1000 * 60 * 20, tokenUsed: 0, gate: 0, claim: "unverified_claim", ...taskRuntimeFields(state, obj.priority),
    };
    state.tasks[task.id] = task; state.taskOrder.unshift(task.id); added += 1;
    emit(state, "TASK_CREATED", "ORG-CEO", task.title, "Reconciled from authoritative Orion plan", { taskId: task.id, modelId: brain.id });
  }
  const activeTasks = desired.map((spec) => Object.values(state.tasks)
    .filter((task) => task.projectId === existing.id && task.title === spec.title && task.requiredCapability === spec.capability && task.departmentId === spec.department && !['done','failed','cancelled'].includes(task.status))
    .sort((a,b) => b.updatedAt - a.updatedAt)[0])
    .filter(Boolean) as Task[];
  for (let i = 0; i < activeTasks.length; i += 1) {
    activeTasks[i].dependencies = i === 0 ? [] : [activeTasks[i - 1].id];
    activeTasks[i].updatedAt = Date.now();
  }
  if (plan.skillGaps?.length) for (const gap of plan.skillGaps) startSkillFactory(state, gap, existing.id, obj.id);
  emit(state, "STRATEGY_SET", "ORG-CEO", obj.text, `Authoritative Orion plan reconciled (${added} task(s) added, stale tasks cancelled)`, { result: existing.id });
}

function capForDept(dept: string, fallback: string): string {
  const map: Record<string, string> = {
    research: "research",
    engineering: "coding",
    quality: "qc",
    security: "security-review",
    operations: "ops",
    knowledge: "documentation",
    skills: "skill-design",
    workforce: "coaching",
    governance: "arbitration",
    recovery: "recovery",
    routing: "routing",
    strategy: "planning",
  };
  return map[dept] ?? fallback;
}

function contextPacket(objective: string, title: string, cap: string, skillId: string | null) {
  return [
    `OBJECTIVE: ${objective}`,
    `TASK: ${title}`,
    `CAPABILITY: ${cap}`,
    `SKILL: ${skillId ?? "none-assigned"}`,
    `CONSTRAINTS: Do not redefine Owner objectives. Cite claim status. Independent QC will review.`,
    `MEMORY: retrieve only tags matching this capability.`,
  ].join("\n");
}

function localStrategy(text: string, depts: string[]): string {
  return `Strategy: treat the Owner objective as binding. Activate ${depts.join(
    ", ",
  )}. Decompose into department tasks with explicit dependencies. Assign the smallest sufficient brain. Route every important output through independent QC and testing. Store only verified results in organizational memory. ${text.slice(0, 160)}`;
}

export function startSkillFactory(
  state: OrgSnapshot,
  cap: string,
  projectId: string,
  objectiveId: string,
) {
  if (state.skills.some((s) => s.capabilities.includes(cap) && s.deploymentStatus !== "rolled_back"))
    return;
  const creator = state.departments.find((d) => d.id === "skills")?.managerId ?? "ORG-CEO";
  const skill: Skill = {
    id: nid("sk"),
    name: cap
      .split("-")
      .map((p) => p[0].toUpperCase() + p.slice(1))
      .join(" "),
    version: "0.1.0",
    purpose: `Generated capability for ${cap}`,
    capabilities: [cap],
    dependencies: ["sk-test-suite"],
    permissions: ["skill.use", "sandbox"],
    tests: [
      { name: "unit", status: "pending" },
      { name: "sandbox-break", status: "pending" },
      { name: "security", status: "pending" },
      { name: "requirement", status: "pending" },
    ],
    benchmark: { score: 0, samples: 0 },
    creatorId: creator,
    reviewerId: null,
    limitations: ["In testing grounds — not production"],
    deploymentStatus: "sandbox",
    rollbackVersion: null,
    changeHistory: [{ at: Date.now(), by: creator, note: "Skill factory opened" }],
    successRate: 0,
    inputs: ["capability-gap", "spec"],
    outputs: ["skill-module", "tests"],
  };
  state.skills.unshift(skill);
  emit(state, "SKILL_CREATED", creator, skill.name, "Capability gap detected", {
    result: skill.id,
  });

  const dept = state.departments.find((d) => d.id === "skills")!;
  const task: Task = {
    id: nid("tsk"),
    projectId,
    objectiveId,
    title: `Build skill: ${skill.name}`,
    description: contextPacket(`Create tested skill for ${cap}`, `Build ${skill.name}`, "skill-design", skill.id),
    departmentId: "skills",
    supervisorId: dept.supervisorIds[0],
    workerId: null,
    qcId: null,
    testerId: null,
    owner: "supervisor",
    status: "queued",
    priority: 5,
    urgency: 5,
    importance: 5,
    risk: "medium",
    skillId: skill.id,
    requiredCapability: "skill-design",
    brainId: "cloud-coder",
    fallbacks: ["grok-fast", "local-heuristic"],
    dependencies: [],
    progress: 0,
    plan: "GENERATE → SANDBOX → TEST → BREAK → FIX → RETEST → BENCHMARK → QC → APPROVE → DEPLOY",
    output: "",
    evidence: [],
    failures: [],
    corrections: 0,
    tests: [
      { name: "unit", result: "pending" },
      { name: "security", result: "pending" },
      { name: "adversarial", result: "pending" },
    ],
    qcVerdict: null,
    qcNotes: "",
    approval: "not_required",
    lessons: [],
    locked: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    deadline: null,
    tokenUsed: 0,
    gate: 0,
    claim: "unverified_claim",
    ...taskRuntimeFields(state, 5),
  };
  state.tasks[task.id] = task;
  state.taskOrder.unshift(task.id);
}

export function issueObjective(state: OrgSnapshot, text: string, priority = 3): string {
  const risk = classifyRisk(text);
  const obj = {
    id: nid("obj"),
    text,
    priority,
    risk,
    status: "strategy" as const,
    strategy: "",
    createdAt: Date.now(),
    requiresApproval: risk === "high" || risk === "critical",
  };
  state.objectives.unshift(obj);
  state.ceo.status = "planning";
  emit(state, "OBJECTIVE_ISSUED", "OWNER", text, "Owner direction", { result: obj.id });
  applyPlan(state, obj.id, { text, risk });
  emit(state, "STRATEGY_SET", "ORG-CEO", obj.strategy.slice(0, 120), "Orion planning complete");
  return obj.id;
}

function eligibleWorker(state: OrgSnapshot, task: Task): Worker | null {
  const team = state.teams.find((t) => t.supervisorId === task.supervisorId);
  const pool = (team?.workerIds ?? state.workerOrder.filter((id) => state.workers[id].departmentId === task.departmentId))
    .map((id) => state.workers[id])
    .filter(
      (w) =>
        w &&
        w.status === "available" &&
        !w.reserved &&
        w.role !== "executive" &&
        w.role !== "manager" &&
        w.role !== "supervisor",
    );
  const capMatch = pool.filter((w) => w.capabilities.includes(task.requiredCapability));
  const ranked = (capMatch.length ? capMatch : pool).sort(
    (a, b) => b.performance.quality - a.performance.quality,
  );
  const rolePref =
    task.requiredCapability === "qc"
      ? ranked.find((w) => w.role === "qc")
      : task.requiredCapability === "testing"
        ? ranked.find((w) => w.role === "tester")
        : task.requiredCapability === "security-review"
          ? ranked.find((w) => w.role === "security")
          : ranked.find((w) => w.role === "worker" || w.role === "specialist" || w.role === "analyst");
  return rolePref ?? ranked[0] ?? null;
}

function pickQc(state: OrgSnapshot, task: Task, authorId: string): Worker | null {
  const team = state.teams.find((t) => t.supervisorId === task.supervisorId);
  const ids = [
    team?.qcId,
    ...state.workerOrder.filter((id) => state.workers[id].role === "qc" && state.workers[id].status === "available"),
  ].filter((id): id is string => !!id && id !== authorId);
  const w = ids.map((id) => state.workers[id]).find((x) => x && x.status === "available");
  return w ?? null;
}

function pickTester(state: OrgSnapshot, authorId: string): Worker | null {
  return (
    state.workerOrder
      .map((id) => state.workers[id])
      .find((w) => w.role === "tester" && w.status === "available" && w.id !== authorId) ?? null
  );
}

function depsReady(state: OrgSnapshot, task: Task) {
  return task.dependencies.every((id) => state.tasks[id]?.status === "delivered");
}

function assignTask(state: OrgSnapshot, task: Task) {
  if (task.locked) return;
  if (!depsReady(state, task)) {
    task.status = "blocked";
    return;
  }
  const worker = eligibleWorker(state, task);
  if (!worker) return;
  ensureAgent(worker);
  const existing = Object.values(state.tasks).find(
    (t) => t.locked && t.workerId === worker.id && t.status !== "delivered" && t.status !== "cancelled",
  );
  if (existing) return;
  worker.status = "assigned";
  worker.currentAssignment = task.id;
  task.workerId = worker.id;
  task.status = "assigned";
  task.locked = true;
  task.updatedAt = Date.now();
  const brain = selectBrain(state, task.requiredCapability, 0.75);
  if (brain.id !== task.brainId) {
    emit(state, "FALLBACK_TRIGGERED", "RTG", `Brain ${task.brainId} → ${brain.id}`, "Routing", {
      taskId: task.id,
      modelId: brain.id,
    });
    state.kpis.fallbacks += 1;
  }
  task.brainId = brain.id;
  task.livePending = Boolean(
    state.runtime?.liveMode &&
      state.runtime?.routingMode !== "local-only" &&
      state.kpis.liveTurns < (state.runtime.liveCap ?? 4) &&
      state.budgets.apiCalls < state.budgets.apiCap,
  );
  emit(state, "TASK_ASSIGNED", worker.id, task.title, "Supervisor assignment", {
    taskId: task.id,
    modelId: brain.id,
  });
  message(state, task.supervisorId ?? "ORG-CEO", worker.id, "request", task.description, task.id);
}

function produceOutput(state: OrgSnapshot, task: Task, worker: Worker, _rand: () => number) {
  const turn = executeLocalWorker(state, worker, task);
  if (!turn.ok) {
    task.output = "";
    task.failures.push({
      at: Date.now(),
      reason: turn.unknowns[0] ?? "Worker/tool failure during execution",
      by: worker.id,
    });
    task.status = "failed";
    task.claim = "error";
    task.trace = turn.trace;
    task.executionSource = turn.source;
    return false;
  }
  applyTurnToTask(state, task, worker, turn);
  return true;
}

function independentQc(state: OrgSnapshot, task: Task, qc: Worker, _rand: () => number) {
  const authorBrain = task.brainId;
  const qcBrain = selectBrain(state, "qc", 0.8);
  if (qcBrain.id === authorBrain && qcBrain.id !== "local-heuristic") {
    const alt = state.brains.find((b) => b.id !== authorBrain && b.available) ?? qcBrain;
    qc.modelId = alt.id;
  } else {
    qc.modelId = qcBrain.id;
  }
  const turn = executeLocalQc(state, qc, task);
  task.qcVerdict = turn.qcPass ? "pass" : "fail";
  task.qcNotes = turn.qcNotes ?? turn.output;
  if (!turn.qcPass) {
    task.claim = "error";
    task.gate = 3;
    return false;
  }
  task.gate = 4;
  // Author output is never world-fact just because QC let it through.
  if (task.evidence.includes("code-run-pass")) task.claim = "fact";
  else task.claim = "unverified_claim";
  return true;
}

function runTests(task: Task, rand: () => number) {
  const fail = /error|unverified verification|rule 4 does not exist/i.test(task.output) && rand() < 0.9;
  task.tests = task.tests.map((t) => ({
    ...t,
    result: fail && t.name !== "unit" ? "fail" : "pass",
  }));
  return task.tests.every((t) => t.result === "pass");
}

function trainWorker(state: OrgSnapshot, worker: Worker, reason: string) {
  worker.status = "training";
  worker.performance.corrections += 1;
  worker.performance.repeats += 1;
  emit(state, "WORKER_RETRAINING_REQUIRED", worker.id, reason, "QC/test failure cycle", {
    result: worker.id,
  });
}

function finishTrain(state: OrgSnapshot, worker: Worker) {
  worker.performance.quality = clamp(worker.performance.quality + 0.08, 0, 0.98);
  worker.performance.improved += 1;
  worker.status = "available";
  worker.currentAssignment = null;
  emit(state, "WORKER_TRAINED", worker.id, "Correction plan applied", "Retest passed coaching", {
    result: worker.id,
  });
}

function promoteOrDemote(state: OrgSnapshot, worker: Worker) {
  const total = worker.performance.done + worker.performance.fail;
  if (total < 8) return;
  const rate = worker.performance.done / total;
  if (rate > 0.92 && worker.performance.quality > 0.9 && worker.rank !== "lead") {
    const order: Worker["rank"][] = ["junior", "standard", "senior", "expert", "lead"];
    const i = order.indexOf(worker.rank);
    if (i >= 0 && i < order.length - 1 && worker.role !== "executive") {
      worker.rank = order[i + 1];
      if (worker.rank === "lead" && worker.role === "worker") worker.title = "Temporary team lead";
      emit(state, "WORKER_PROMOTED", worker.id, `Promoted to ${worker.rank}`, "Measured performance", {
        result: worker.rank,
      });
    }
  }
  if (rate < 0.45 && worker.performance.corrections > 4 && worker.role === "worker") {
    worker.rank = "junior";
    emit(state, "WORKER_DEMOTED", worker.id, "Reduced task complexity", "Repeated failures", {
      result: worker.rank,
    });
  }
}

function storeLesson(state: OrgSnapshot, task: Task, ok: boolean) {
  const item: MemoryItem = {
    id: nid("mem"),
    layer: "org",
    ownerId: "ORG",
    title: ok ? `Verified: ${task.title}` : `Rejected approach: ${task.title}`,
    content: ok
      ? task.output.slice(0, 400)
      : `Failed because: ${task.qcNotes || task.failures.at(-1)?.reason || "unknown"}. Do not reuse.`,
    status: ok ? "verified" : "rejected",
    claim: ok && task.evidence.includes("code-run-pass") ? "verified_fact" : ok ? "unverified_claim" : "error",
    tags: [task.requiredCapability, task.departmentId],
    evidence: task.evidence,
    createdBy: task.qcId ?? task.workerId ?? "ORG-CEO",
    createdAt: Date.now(),
    relatedSkillId: task.skillId,
    relatedTaskId: task.id,
  };
  state.memory.unshift(item);
  if (state.memory.length > 400) state.memory.length = 400;
  emit(state, "KNOWLEDGE_STORED", item.createdBy, item.title, ok ? "Validated" : "Rejected", {
    taskId: task.id,
    result: item.status,
  });
  if (ok) task.lessons.push(item.title);
}

export function retrieveMemory(state: OrgSnapshot, query: string, k = 4): MemoryItem[] {
  const q = query.toLowerCase();
  return state.memory
    .filter((m) => m.status !== "rejected")
    .map((m) => {
      let score = 0;
      if (m.tags.some((t) => q.includes(t))) score += 3;
      if (m.title.toLowerCase().includes(q)) score += 2;
      if (m.status === "verified") score += 2;
      if (m.layer === "org") score += 1;
      return { m, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .map((x) => x.m);
}

function replaceSupervisor(state: OrgSnapshot, failedId: string) {
  const failed = state.workers[failedId];
  if (!failed || failed.role !== "supervisor") return;
  const team = state.teams.find((t) => t.supervisorId === failedId);
  const successor =
    team?.workerIds
      .map((id) => state.workers[id])
      .filter((w) => w && w.status !== "disabled")
      .sort((a, b) => b.performance.quality - a.performance.quality)[0] ?? null;
  if (!successor) return;
  const dept = state.departments.find((d) => d.id === failed.departmentId);
  successor.role = "supervisor";
  successor.title = failed.title;
  successor.teamId = failed.teamId;
  successor.rank = "lead";
  successor.memoryScope = "team";
  successor.status = "available";
  if (dept) {
    dept.supervisorIds = dept.supervisorIds.map((id) => (id === failedId ? successor.id : id));
  }
  if (team) {
    team.supervisorId = successor.id;
    team.workerIds = team.workerIds.filter((id) => id !== successor.id);
  }
  for (const t of Object.values(state.tasks)) {
    if (t.supervisorId === failedId && t.status !== "delivered") t.supervisorId = successor.id;
  }
  failed.status = "disabled";
  failed.disabledReason = "Supervisor failure — succession";
  failed.currentAssignment = null;
  emit(
    state,
    "SUPERVISOR_REPLACED",
    successor.id,
    `Team ${team?.name ?? ""} transferred from ${failedId} to ${successor.id}`,
    "Succession protocol",
    { result: successor.id },
  );
}

function rebalance(state: OrgSnapshot) {
  const load: Record<string, number> = {};
  for (const t of Object.values(state.tasks)) {
    if (!t.supervisorId) continue;
    if (["delivered", "cancelled", "failed"].includes(t.status)) continue;
    load[t.supervisorId] = (load[t.supervisorId] ?? 0) + 1;
  }
  const entries = Object.entries(load);
  if (entries.length < 2) return;
  const max = entries.reduce((a, b) => (b[1] > a[1] ? b : a));
  const min = entries.reduce((a, b) => (b[1] < a[1] ? b : a));
  if (max[1] - min[1] >= 3) {
    const task = Object.values(state.tasks).find(
      (t) => t.supervisorId === max[0] && (t.status === "queued" || t.status === "blocked") && !t.locked,
    );
    if (task) {
      task.supervisorId = min[0];
      emit(state, "REBALANCE", "ORG-CEO", `Moved ${task.id} ${max[0]} → ${min[0]}`, "Supervisor load", {
        taskId: task.id,
      });
    }
  }
}

function maybeImprove(state: OrgSnapshot, rand: () => number) {
  if (state.improvements.some((i) => i.status !== "deployed" && i.status !== "rolled_back")) return;
  if (state.kpis.qcCatchRate > 0.5 && rand() > 0.015) return;
  const imp: Improvement = {
    id: nid("imp"),
    title: "Tighten QC sampling on low-quality workers",
    observation: "QC catch rate and weak-worker failures indicate under-sampling.",
    proposal: "Route workers with quality < 0.7 through mandatory dual QC before testing.",
    status: "propose",
    createdAt: Date.now(),
    metric: "qcCatchRate",
  };
  state.improvements.unshift(imp);
  emit(state, "IMPROVEMENT_PROPOSED", "ORG-CEO", imp.title, imp.observation);
}

function advanceSkill(state: OrgSnapshot, skill: Skill) {
  const order: Skill["deploymentStatus"][] = [
    "draft",
    "sandbox",
    "testing",
    "review",
    "approved",
    "production",
  ];
  const i = order.indexOf(skill.deploymentStatus);
  if (i < 0 || skill.deploymentStatus === "production") return;
  if (state.faults.failedDeploy && skill.deploymentStatus === "approved") {
    skill.deploymentStatus = "rolled_back";
    emit(state, "SKILL_ROLLED_BACK", skill.creatorId, skill.name, "Failed deployment", {
      result: skill.id,
    });
    return;
  }
  const next = order[Math.min(i + 1, order.length - 1)];
  skill.deploymentStatus = next;
  skill.changeHistory.push({ at: Date.now(), by: skill.creatorId, note: `Moved to ${next}` });
  if (next === "testing" || next === "review") {
    skill.tests = skill.tests.map((t) => ({ ...t, status: "pass" }));
    skill.benchmark = { score: 0.88, samples: 12 };
  }
  if (next === "production") {
    skill.limitations = ["Certified in testing grounds"];
    skill.successRate = 0.88;
    skill.reviewerId = state.departments.find((d) => d.id === "quality")?.managerId ?? null;
    emit(state, "SKILL_DEPLOYED", skill.reviewerId ?? "ORG-CEO", skill.name, "Gates passed", {
      result: skill.id,
    });
  }
}

function applyFaults(state: OrgSnapshot) {
  const f = state.faults;
  if (f.modelFailure) {
    const primary = state.brains.find((b) => b.id === "grok-4.5");
    if (primary && primary.available) {
      primary.available = false;
      emit(state, "MODEL_FAILED", "RTG", "Grok 4.5 unavailable", "Fault injection", {
        modelId: "grok-4.5",
      });
      emit(state, "FALLBACK_TRIGGERED", "RTG", "Switch to fallback chain", "Brain failure ≠ org failure", {
        modelId: "grok-fast",
      });
      state.kpis.fallbacks += 1;
    }
  } else {
    const primary = state.brains.find((b) => b.id === "grok-4.5");
    if (primary) primary.available = true;
  }
  if (f.providerFailure) {
    for (const b of state.brains) if (b.provider === "xai") b.available = false;
  }
  if (f.supervisorFailureId) {
    const s = state.workers[f.supervisorFailureId];
    if (s && s.role === "supervisor" && s.status !== "disabled") replaceSupervisor(state, s.id);
    f.supervisorFailureId = null;
  }
  if (f.workerFailureId) {
    const w = state.workers[f.workerFailureId];
    if (w && w.currentAssignment) {
      const t = state.tasks[w.currentAssignment];
      if (t && t.status !== "delivered") {
        t.locked = false;
        t.status = "queued";
        t.workerId = null;
        emit(state, "WORKER_REASSIGNED", w.id, "Assignment released after worker fault", "Recovery", {
          taskId: t.id,
        });
      }
      w.status = "recovery";
    }
  }
}

function recompute(state: OrgSnapshot) {
  const ws = state.workerOrder.map((id) => state.workers[id]);
  const active = ws.filter((w) =>
    ["working", "assigned", "qc"].includes(w.status),
  ).length;
  const available = ws.filter((w) => w.status === "available").length;
  const training = ws.filter((w) => w.status === "training").length;
  const tasks = Object.values(state.tasks);
  const delivered = tasks.filter((t) => t.status === "delivered").length;
  const failed = tasks.filter((t) => t.status === "failed").length;
  const qcFail = tasks.filter((t) => t.qcVerdict === "fail").length;
  const qcDone = tasks.filter((t) => t.qcVerdict === "pass" || t.qcVerdict === "fail").length;
  state.kpis = {
    ...state.kpis,
    activeWorkers: active,
    availableWorkers: available,
    trainingWorkers: training,
    delivered,
    failed,
    successRate: delivered + failed === 0 ? state.kpis.successRate : delivered / (delivered + failed),
    qcCatchRate: qcDone === 0 ? state.kpis.qcCatchRate : qcFail / qcDone,
    tokenEfficiency: state.budgets.tokens === 0 ? 0.82 : clamp(1 - state.budgets.tokens / 200000, 0.2, 0.99),
  };
  for (const d of state.departments) {
    const ids = state.workerOrder.filter((id) => state.workers[id].departmentId === d.id);
    const q = tasks.filter((t) => t.departmentId === d.id && !["delivered", "cancelled"].includes(t.status)).length;
    state.deptStats[d.id] = {
      active: ids.filter((id) => ["working", "assigned", "qc"].includes(state.workers[id].status)).length,
      available: ids.filter((id) => state.workers[id].status === "available").length,
      queue: q,
      quality:
        ids.reduce((a, id) => a + state.workers[id].performance.quality, 0) / Math.max(1, ids.length),
      failRate: 0.04,
    };
  }
  for (const p of state.projects) {
    const ts = tasks.filter((t) => t.projectId === p.id);
    if (!ts.length) continue;
    const done = ts.filter((t) => t.status === "delivered").length;
    p.progress = done / ts.length;
    if (p.status === "awaiting_approval") continue;
    if (ts.every((t) => t.status === "delivered")) {
      p.status = "delivered";
      const obj = state.objectives.find((o) => o.id === p.objectiveId);
      if (obj) obj.status = "delivered";
    } else if (ts.some((t) => t.status === "failed" && t.corrections > 3)) p.status = "blocked";
    else p.status = "active";
  }
}

export function tick(state: OrgSnapshot, steps = 1) {
  if (state.orgStatus !== "running") return;
  if (!state.runtime) {
    state.runtime = {
      liveMode: false,
      liveInflight: 0,
      liveCap: 4,
      mode: "production",
      isolated: [],
      routingMode: "local-only",
      toolRuns: 0,
    };
  }
  state.kpis.liveTurns ??= 0;
  state.kpis.localTurns ??= 0;
  state.kpis.unknowns ??= 0;
  const rand = mulberry32(state.epoch * 997 + 13);
  applyFaults(state);

  for (const skill of state.skills) {
    if (skill.deploymentStatus !== "production" && skill.deploymentStatus !== "rolled_back") {
      if (rand() < 0.35) advanceSkill(state, skill);
    }
  }

  for (const imp of state.improvements) {
    if (imp.status === "deployed" || imp.status === "rolled_back") continue;
    const order: Improvement["status"][] = [
      "observe",
      "propose",
      "sandbox",
      "test",
      "benchmark",
      "qc",
      "approve",
      "deployed",
    ];
    const i = order.indexOf(imp.status);
    if (i >= 0 && i < order.length - 1 && rand() < 0.4) {
      imp.status = order[i + 1];
      if (imp.status === "deployed") {
        emit(state, "IMPROVEMENT_DEPLOYED", "ORG-CEO", imp.title, "Gates passed");
      }
    }
  }

  const tasks = state.taskOrder.map((id) => state.tasks[id]).filter(Boolean);

  for (const t of tasks) {
    if (t.status === "queued" || t.status === "blocked") assignTask(state, t);
  }

  let processed = 0;
  for (const t of tasks) {
    if (processed >= 10 * steps) break;
    const worker = t.workerId ? state.workers[t.workerId] : null;

    if (t.status === "assigned" && worker) {
      worker.status = "working";
      t.status = "in_progress";
      t.gate = 1;
      processed++;
      continue;
    }

    if (t.status === "in_progress" && worker) {
      if (t.livePending) {
        t.checkpoint = { step: "in_progress", at: Date.now(), note: "awaiting live brain" };
        processed++;
        continue;
      }
      t.progress = clamp(t.progress + 0.28 + rand() * 0.25, 0, 1);
      processed++;
      if (t.progress < 1 && !state.faults.timeout) continue;
      const ok = produceOutput(state, t, worker, rand);
      t.progress = 1;
      t.gate = 2;
      t.status = ok ? "self_check" : "failed";
      if (!ok) {
        worker.performance.fail += 1;
        trainWorker(state, worker, t.failures.at(-1)?.reason ?? "execution failure");
        t.locked = false;
        emit(state, "TASK_FAILED", worker.id, t.title, "Execution failure", { taskId: t.id });
      }
      continue;
    }

    if (t.status === "self_check" && worker) {
      t.status = "supervisor_review";
      t.gate = 2;
      processed++;
      continue;
    }

    if (t.status === "supervisor_review") {
      t.status = "qc";
      t.gate = 3;
      processed++;
      continue;
    }

    if (t.status === "qc") {
      const authorId = t.workerId ?? "";
      const qc = t.qcId ? state.workers[t.qcId] : pickQc(state, t, authorId);
      if (!qc) continue;
      t.qcId = qc.id;
      qc.status = "qc";
      qc.currentAssignment = t.id;
      const pass = independentQc(state, t, qc, rand);
      processed++;
      if (!pass) {
        t.status = "failed";
        t.corrections += 1;
        emit(state, "QC_FAILED", qc.id, t.title, t.qcNotes, { taskId: t.id, modelId: qc.modelId });
        if (worker) {
          worker.performance.qcFail += 1;
          worker.performance.fail += 1;
          if (worker.performance.qcFail >= 2) trainWorker(state, worker, "Repeated QC failures");
          else {
            worker.status = "available";
            worker.currentAssignment = null;
          }
        }
        qc.status = "available";
        qc.currentAssignment = null;
        if (t.corrections < 3) {
          t.status = "queued";
          t.locked = false;
          t.workerId = null;
          t.progress = 0.2;
          t.qcVerdict = "fail";
        }
        continue;
      }
      emit(state, "QC_PASSED", qc.id, t.title, t.qcNotes, { taskId: t.id, modelId: qc.modelId });
      t.status = "testing";
      t.gate = 4;
      qc.status = "available";
      qc.currentAssignment = null;
      continue;
    }

    if (t.status === "testing") {
      const tester = t.testerId ? state.workers[t.testerId] : pickTester(state, t.workerId ?? "");
      if (tester) {
        t.testerId = tester.id;
        tester.status = "working";
      }
      const pass = runTests(t, rand);
      processed++;
      if (tester) {
        tester.status = "available";
        tester.currentAssignment = null;
      }
      if (!pass) {
        t.status = "failed";
        t.corrections += 1;
        emit(state, "TEST_FAILED", tester?.id ?? "QLY", t.title, "Verification suite failed", {
          taskId: t.id,
        });
        if (worker) trainWorker(state, worker, "Test failure");
        if (t.corrections < 3) {
          t.status = "queued";
          t.locked = false;
          t.workerId = null;
          t.progress = 0.15;
        }
        continue;
      }
      emit(state, "TEST_PASSED", tester?.id ?? "QLY", t.title, "Verification suite passed", {
        taskId: t.id,
      });
      t.status = t.risk === "high" || t.risk === "critical" || t.requiredCapability === "security-review" ? "security_review" : "verification";
      t.gate = 5;
      continue;
    }

    if (t.status === "security_review") {
      t.gate = 6;
      t.status = "verification";
      processed++;
      continue;
    }

    if (t.status === "verification") {
      t.gate = 7;
      t.status = "delivered";
      t.claim = "verified_fact";
      t.updatedAt = Date.now();
      if (worker) {
        worker.performance.done += 1;
        worker.status = "available";
        worker.currentAssignment = null;
        promoteOrDemote(state, worker);
      }
      storeLesson(state, t, true);
      emit(state, "TASK_COMPLETED", worker?.id ?? "ORG-CEO", t.title, "All quality gates passed", {
        taskId: t.id,
        modelId: t.brainId,
        result: "delivered",
      });
      emit(state, "DELIVERY", "ORG-CEO", t.title, "Organizational verification", { taskId: t.id });
      processed++;
      continue;
    }

    if (worker && t.status === "failed" && t.corrections >= 3 && worker.performance.qcFail >= 4) {
      worker.status = "disabled";
      worker.disabledReason = "Repeated failures after coaching";
      emit(state, "WORKER_DISABLED", "ORG-CEO", worker.id, "Policy after correction limits", {
        result: worker.id,
      });
    }
  }

  for (const id of state.workerOrder) {
    const w = state.workers[id];
    if (w.status === "training" && rand() < 0.35) finishTrain(state, w);
    if (w.status === "recovery" && rand() < 0.4) {
      w.status = "available";
      emit(state, "RECOVERY_SUCCEEDED", w.id, "Worker returned to pool", "Recovery team");
    }
  }

  rebalance(state);
  maybeImprove(state, rand);
  recompute(state);
  state.epoch += 1;
  state.lastTickAt = Date.now();
  if (state.epoch % 18 === 0) {
    emit(state, "HEARTBEAT", "ORG-CEO", "Organization pulse", `${state.kpis.activeWorkers} active`, {
      result: String(state.epoch),
    });
  }
}

export function grantApproval(state: OrgSnapshot, approvalId: string, grant: boolean) {
  const a = state.approvals.find((x) => x.id === approvalId);
  if (!a || a.status !== "pending") return;
  a.status = grant ? "granted" : "rejected";
  emit(
    state,
    grant ? "APPROVAL_GRANTED" : "APPROVAL_REJECTED",
    "OWNER",
    a.title,
    grant ? "Owner approved" : "Owner rejected",
    { result: a.refId },
  );
  const obj = state.objectives.find((o) => o.id === a.refId);
  if (obj) {
    if (grant) {
      obj.status = "active";
      obj.requiresApproval = false;
      const p = state.projects.find((x) => x.objectiveId === obj.id);
      if (p) p.status = "active";
      for (const t of Object.values(state.tasks)) {
        if (t.objectiveId === obj.id && t.status === "awaiting_approval") {
          t.status = "queued";
          t.approval = "granted";
        }
      }
    } else {
      obj.status = "rejected";
      for (const t of Object.values(state.tasks)) {
        if (t.objectiveId === obj.id) t.status = "cancelled";
      }
    }
  }
  if (a.kind === "improvement") {
    const imp = state.improvements.find((i) => i.id === a.refId);
    if (imp) imp.status = grant ? "deployed" : "rolled_back";
  }
}

export function emergencyShutdown(state: OrgSnapshot) {
  state.orgStatus = "shutdown";
  state.ceo.status = "unavailable";
  emit(state, "EMERGENCY_SHUTDOWN", "OWNER", "All new autonomous actions halted", "Owner emergency control");
}

export function setOrgStatus(state: OrgSnapshot, status: OrgSnapshot["orgStatus"]) {
  state.orgStatus = status;
  if (status === "paused") emit(state, "ORG_PAUSED", "OWNER", "Organization paused", "Owner control");
  if (status === "running") {
    state.ceo.status = "directing";
    emit(state, "ORG_RESUMED", "OWNER", "Organization resumed", "Owner control");
  }
  if (status === "recovering") {
    state.orgStatus = "running";
    emit(state, "ORG_RECOVERED", "ORG-CEO", "Restored from last checkpoint", "Disaster recovery");
  }
}

export function disableWorker(state: OrgSnapshot, workerId: string, reason: string) {
  const w = state.workers[workerId];
  if (!w) return;
  w.status = "disabled";
  w.disabledReason = reason;
  if (w.currentAssignment) {
    const t = state.tasks[w.currentAssignment];
    if (t) {
      t.locked = false;
      t.status = "queued";
      t.workerId = null;
    }
  }
  w.currentAssignment = null;
  emit(state, "WORKER_DISABLED", "OWNER", workerId, reason);
}

export function disableSkill(state: OrgSnapshot, skillId: string) {
  const s = state.skills.find((x) => x.id === skillId);
  if (!s) return;
  s.deploymentStatus = "rolled_back";
  emit(state, "SKILL_ROLLED_BACK", "OWNER", s.name, "Owner disabled skill");
}

export function setBrainAvailable(state: OrgSnapshot, brainId: string, available: boolean) {
  const b = state.brains.find((x) => x.id === brainId);
  if (!b) return;
  b.available = available;
  b.health = available ? "up" : "down";
  if (!available) {
    emit(state, "MODEL_FAILED", "OWNER", `${b.name} disabled by Owner`, "Owner control", { modelId: brainId });
    emit(state, "FALLBACK_TRIGGERED", "RTG", "Rerouting away from disabled brain", "Owner control", {
      modelId: "local-heuristic",
    });
    emit(state, "PROVIDER_DOWN", "RTG", `${b.provider} marked unavailable`, "Owner control", { modelId: brainId });
  } else {
    emit(state, "PROVIDER_RECOVERED", "RTG", `${b.name} restored`, "Owner control", { modelId: brainId });
  }
}

export function isolate(
  state: OrgSnapshot,
  kind: "worker" | "department" | "team" | "task" | "tool" | "skill" | "provider",
  id: string,
) {
  if (!state.runtime) return;
  state.runtime.isolated = [...(state.runtime.isolated ?? []), { kind, id }];
  if (kind === "worker") disableWorker(state, id, "Isolated by Owner");
  if (kind === "department") {
    for (const t of Object.values(state.tasks)) {
      if (t.departmentId === id && !["delivered", "cancelled"].includes(t.status)) t.status = "blocked";
    }
  }
  if (kind === "task") {
    const t = state.tasks[id];
    if (t) t.status = "cancelled";
  }
  if (kind === "provider") setBrainAvailable(state, id, false);
  if (kind === "skill") disableSkill(state, id);
  emit(state, "ISOLATE", "OWNER", `${kind} ${id} isolated`, "Emergency control");
}

export function setLiveMode(state: OrgSnapshot, on: boolean) {
  if (!state.runtime) return;
  state.runtime.liveMode = on;
  if (!on) state.runtime.routingMode = "local-only";
  else if (state.runtime.routingMode === "local-only") state.runtime.routingMode = "auto";
}

export function setRoutingMode(state: OrgSnapshot, mode: OrgSnapshot["runtime"]["routingMode"]) {
  if (!state.runtime) return;
  state.runtime.routingMode = mode;
  // Routing is a brain/provider concern. It must never implicitly enable
  // live trading; live execution stays structurally disabled until a
  // separately governed release changes that invariant.
  state.runtime.liveMode = false;
}

export const GATE_LABELS = QUALITY_GATES;

export function nextWorkerId(state: OrgSnapshot) {
  return `W-${padId(state.workerOrder.length + 1)}`;
}

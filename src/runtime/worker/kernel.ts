import type { ClaimKind, OrgSnapshot, Task, Worker } from "@/org/types";
import { runTool, toolsForPermissions, type ToolResult } from "@/runtime/tools/runtime";
import { composeQcPolicy, composeWorkerPolicy } from "./policy";

export interface TurnResult {
  ok: boolean;
  output: string;
  plan: string;
  evidence: string[];
  claim: ClaimKind;
  unknowns: string[];
  tokens: number;
  source: "local" | "live" | "fallback";
  brainId: string;
  trace: string[];
  tools: ToolResult[];
  refuse: boolean;
  qcPass?: boolean;
  qcNotes?: string;
}

function claimOf(text: string, forced?: ClaimKind): ClaimKind {
  if (forced) return forced;
  const t = text.toLowerCase();
  if (t.includes("i don't know") || t.includes("unknown") || t.includes("need a specialist")) return "unknown";
  if (t.includes("assumption")) return "assumption";
  if (/error|cannot safely|refused/.test(t)) return "error";
  if (t.includes("verified")) return "unverified_claim";
  return "unverified_claim";
}

export function executeLocalWorker(state: OrgSnapshot, worker: Worker, task: Task): TurnResult {
  const skill = state.skills.find((s) => s.id === task.skillId);
  const composed = composeWorkerPolicy(state, worker, task, skill);
  const tools = toolsForPermissions(worker.toolPermissions);
  const mem = composed.memory;
  const traces: string[] = [
    `${worker.agent.registryId} accepted ${task.id}`,
    `style=${worker.agent.style} spec=${worker.agent.specialization}`,
    `brain-local=${task.brainId} scope=${worker.memoryScope}`,
  ];

  const toolContext = { memory: mem, allowed: tools, worker: { capabilities: worker.capabilities, toolPermissions: worker.toolPermissions } };
  const memHit = runTool({ name: "memory.search", input: task.requiredCapability }, toolContext);
  const check = runTool({ name: "checklist", input: task.title }, toolContext);
  traces.push(`tool memory.search: ${memHit.output.slice(0, 120)}`);
  traces.push("tool checklist: requirements loaded");

  const forceBad =
    state.faults.badOutput ||
    task.title.toLowerCase().includes("as if rule 4") ||
    worker.performance.quality < 0.62;

  if (state.faults.toolFailure) {
    return {
      ok: false,
      output: "",
      plan: composed.agent.methodology.join(" → "),
      evidence: [],
      claim: "error",
      unknowns: ["tool runtime unavailable"],
      tokens: 12,
      source: "local",
      brainId: "local-heuristic",
      trace: [...traces, "tool failure — escalate"],
      tools: [memHit],
      refuse: true,
    };
  }

  if (forceBad) {
    const output = `DRAFT (unverified): ${task.title}. This output skips independent verification and treats assumptions as facts. Related: ${mem.map((m) => m.title).join("; ") || "none"}.`;
    return {
      ok: true,
      output,
      plan: "Draft without gates (invalid).",
      evidence: ["author-self-report"],
      claim: "unverified_claim",
      unknowns: ["verification skipped"],
      tokens: 90,
      source: "local",
      brainId: task.brainId,
      trace: [...traces, "self-check skipped — will fail independent QC"],
      tools: [memHit, check],
      refuse: false,
    };
  }

  const verified = mem.filter((m) => m.status === "verified");
  const unknowns: string[] = [];
  if (!verified.length) unknowns.push("no prior verified lesson for this capability");
  if (worker.agent.riskTolerance === "conservative" && task.risk === "critical") {
    unknowns.push("critical risk — Owner approval required before irreversible action");
  }

  const refuse = /cannot|don't know|need a specialist/i.test(task.description) && task.risk === "critical";

  const output = [
    `RESULT: ${task.title}`,
    `WORKER: ${worker.agent.registryId} ${worker.name} (${worker.agent.specialization})`,
    `METHOD: ${worker.agent.methodology.join(" → ")}`,
    `SKILL: ${skill?.name ?? task.requiredCapability} v${skill?.version ?? "n/a"} (model-independent)`,
    `BRAIN: local-heuristic executing ${task.brainId} policy`,
    `STYLE: ${worker.agent.style}/${worker.agent.verbosity}`,
    `CLAIM STATUS: unverified_claim (pending independent QC)`,
    verified.length
      ? `USED MEMORY: ${verified.map((m) => m.title).join("; ")}`
      : "USED MEMORY: none (no prior verified lesson)",
    `SELF-CHECK: Owner objective bound; secrets absent; external content not used as authority.`,
    `EVIDENCE: requirement-trace, scoped-memory, skill-method ${skill?.benchmark.score ?? 0}`,
    unknowns.length ? `UNKNOWNS: ${unknowns.join("; ")}` : "UNKNOWNS: none stated",
    `NOTES: Context firewall applied. Author is not the judge. ${task.description.slice(0, 180)}`,
  ].join("\n");

  traces.push("self-check: constitution + claim status + firewall");
  worker.agent.lastTrace = traces.join(" · ");
  worker.agent.heartbeatAt = Date.now();
  worker.agent.workload = 1;

  return {
    ok: !refuse,
    output,
    plan: worker.agent.methodology.join(" → "),
    evidence: ["requirement-trace", "self-check", "scoped-memory"],
    claim: claimOf(output),
    unknowns,
    tokens: 70 + Math.min(180, output.length / 4),
    source: "local",
    brainId: "local-heuristic",
    trace: traces,
    tools: [memHit, check],
    refuse,
  };
}

export function executeLocalQc(state: OrgSnapshot, qc: Worker, task: Task): TurnResult {
  const policy = composeQcPolicy(state, qc, task);
  const looksBad =
    /skips independent verification|as if rule 4|treats assumptions as facts/i.test(task.output) ||
    task.claim === "error" ||
    !task.output ||
    task.evidence.length === 0 ||
    task.evidence.includes("author-self-report");

  const pass = !looksBad;
  const notes = pass
    ? `Independent QC (${qc.agent.registryId}) confirmed requirement trace. Author brain ${task.brainId} was not the judge.`
    : `Independent QC (${qc.agent.registryId}) rejected author ${task.workerId}. Missing verification or requirement drift.`;

  qc.agent.lastTrace = `qc ${pass ? "pass" : "fail"} on ${task.id}`;
  qc.agent.heartbeatAt = Date.now();

  return {
    ok: pass,
    output: notes,
    plan: "independent evaluation",
    evidence: pass ? ["qc-checklist", "author-brain-separated"] : ["qc-reject"],
    claim: pass ? "fact" : "error",
    unknowns: [],
    tokens: 40,
    source: "local",
    brainId: qc.modelId,
    trace: [`QC ${qc.id} reviewed ${task.id}`, policy.system.slice(0, 80)],
    tools: [],
    refuse: false,
    qcPass: pass,
    qcNotes: notes,
  };
}

export function applyTurnToTask(state: OrgSnapshot, task: Task, worker: Worker, turn: TurnResult) {
  task.output = turn.output;
  task.plan = turn.plan || task.plan;
  task.evidence = turn.evidence;
  task.claim = turn.claim;
  task.unknowns = turn.unknowns;
  task.tokenUsed += Math.round(turn.tokens);
  task.executionSource = turn.source;
  task.livePending = false;
  task.trace = [...(task.trace ?? []), ...turn.trace].slice(-24);
  task.checkpoint = { step: "self_check", at: Date.now(), note: turn.refuse ? "refused" : "artifact produced" };
  task.updatedAt = Date.now();
  state.budgets.tokens += Math.round(turn.tokens);
  worker.performance.tokens += Math.round(turn.tokens);
  worker.lastActiveAt = Date.now();
  const brain = state.brains.find((b) => b.id === turn.brainId) ?? state.brains.find((b) => b.id === task.brainId);
  if (brain) {
    brain.tokensUsed += Math.round(turn.tokens);
    brain.tasks += 1;
  }
  if (turn.source === "live") state.kpis.liveTurns += 1;
  else state.kpis.localTurns += 1;
  if (turn.unknowns.length) {
    worker.agent.unknowns += turn.unknowns.length;
    state.kpis.unknowns += turn.unknowns.length;
  }
}

export function applyLiveText(state: OrgSnapshot, task: Task, worker: Worker, text: string, brainId: string, tokens: number) {
  const turn: TurnResult = {
    ok: true,
    output: text,
    plan: worker.agent.methodology.join(" → "),
    evidence: ["live-brain", "requirement-trace"],
    claim: claimOf(text),
    unknowns: /i don't know|unknown|need (more|a specialist)/i.test(text)
      ? ["model stated uncertainty"]
      : [],
    tokens,
    source: brainId === "local-heuristic" ? "fallback" : "live",
    brainId,
    trace: [`live turn via ${brainId}`, `${tokens} tokens`],
    tools: [],
    refuse: false,
  };
  applyTurnToTask(state, task, worker, turn);
}

export type OrgStatus = "booting" | "running" | "paused" | "shutdown" | "recovering";

export type RiskLevel = "low" | "medium" | "high" | "critical";

export type WorkerRole =
  | "executive"
  | "manager"
  | "supervisor"
  | "worker"
  | "qc"
  | "tester"
  | "security"
  | "recovery"
  | "specialist"
  | "analyst";

export type WorkerStatus =
  | "created"
  | "configured"
  | "tested"
  | "available"
  | "assigned"
  | "working"
  | "qc"
  | "training"
  | "recovery"
  | "reserved"
  | "disabled"
  | "blocked"
  | "suspended";

export type WorkerRank = "junior" | "standard" | "senior" | "expert" | "lead";

export type WorkerHealth = "healthy" | "degraded" | "training" | "blocked" | "unavailable" | "suspended";

export type ReasoningStyle = "analytic" | "synthetic" | "skeptical" | "procedural" | "adversarial";

export type KnowledgeStatus =
  | "verified"
  | "unverified"
  | "rejected"
  | "superseded"
  | "under_review"
  | "proposed"
  | "testing"
  | "deprecated";

export type ClaimKind =
  | "fact"
  | "verified_fact"
  | "unverified_claim"
  | "assumption"
  | "unknown"
  | "error";

export type SkillStatus =
  | "draft"
  | "sandbox"
  | "testing"
  | "review"
  | "approved"
  | "production"
  | "rolled_back";

export type TaskStatus =
  | "created"
  | "planned"
  | "queued"
  | "assigned"
  | "accepted"
  | "planning"
  | "in_progress"
  | "waiting_tool"
  | "waiting_dependency"
  | "self_check"
  | "supervisor_review"
  | "qc"
  | "testing"
  | "security_review"
  | "verification"
  | "delivered"
  | "failed"
  | "blocked"
  | "cancelled"
  | "awaiting_approval"
  | "escalated"
  | "correction"
  | "retest";

export type QueueName =
  | "ceo"
  | "department"
  | "supervisor"
  | "worker"
  | "qc"
  | "testing"
  | "recovery"
  | "approval";

export type EventType =
  | "TASK_CREATED"
  | "TASK_ASSIGNED"
  | "TASK_STARTED"
  | "TASK_COMPLETED"
  | "TASK_FAILED"
  | "TASK_CANCELLED"
  | "QC_STARTED"
  | "QC_FAILED"
  | "QC_PASSED"
  | "TEST_FAILED"
  | "TEST_PASSED"
  | "WORKER_RETRAINING_REQUIRED"
  | "WORKER_TRAINED"
  | "WORKER_PROMOTED"
  | "WORKER_DEMOTED"
  | "WORKER_REASSIGNED"
  | "WORKER_DISABLED"
  | "WORKER_DEGRADED"
  | "MODEL_FAILED"
  | "MODEL_SWITCHED"
  | "FALLBACK_TRIGGERED"
  | "PROVIDER_DOWN"
  | "PROVIDER_RECOVERED"
  | "SKILL_CREATED"
  | "SKILL_DEPLOYED"
  | "SKILL_ROLLED_BACK"
  | "SKILL_VERIFIED"
  | "DEPLOYMENT_ROLLED_BACK"
  | "APPROVAL_REQUIRED"
  | "APPROVAL_GRANTED"
  | "APPROVAL_REJECTED"
  | "SUPERVISOR_REPLACED"
  | "MANAGER_REPLACED"
  | "OBJECTIVE_ISSUED"
  | "STRATEGY_SET"
  | "PROJECT_CREATED"
  | "DELIVERY"
  | "KNOWLEDGE_STORED"
  | "IMPROVEMENT_PROPOSED"
  | "IMPROVEMENT_DEPLOYED"
  | "FAULT_INJECTED"
  | "RECOVERY_SUCCEEDED"
  | "EMERGENCY_SHUTDOWN"
  | "ORG_PAUSED"
  | "ORG_RESUMED"
  | "ORG_RECOVERED"
  | "REBALANCE"
  | "ESCALATION"
  | "DISAGREEMENT"
  | "ARBITRATION"
  | "HEARTBEAT"
  | "SECURITY_ALERT"
  | "SYSTEM_DEGRADED"
  | "ISOLATE"
  | "LIVE_TURN"
  | "MARKET_TICK"
  | "FAST_SIGNAL_EMITTED"
  | "RISK_VETO"
  | "ORDER_SUBMITTED"
  | "ORDER_FILLED"
  | "POSITION_CHANGED"
  | "DATA_STALE"
  | "LATENCY_DEGRADED";

export type MemoryLayer =
  | "org"
  | "department"
  | "team"
  | "worker"
  | "task"
  | "project"
  | "skill"
  | "knowledge"
  | "audit";

export type BrainProvider =
  | "xai"
  | "openai"
  | "anthropic"
  | "google"
  | "openrouter"
  | "omniroute"
  | "ollama"
  | "local"
  | "open"
  | "cloud";

export type CostClass = "free" | "paid" | "local" | "self-hosted" | "limited" | "unknown";

export type BrainHealth = "up" | "down" | "degraded" | "circuit-open";

export type ExecutionSource = "pending" | "local" | "live" | "fallback";

export type PriorityBand = "critical" | "high" | "normal" | "low" | "background";

export type RoutingMode = "auto" | "local-only" | "hybrid" | "cloud-first";

export type ConnectionState = "untested" | "connected" | "invalid" | "not_configured" | "offline";

export type BrainKind = "cloud" | "local" | "heuristic" | "gateway";

export interface PerformanceProfile {
  done: number;
  fail: number;
  qcFail: number;
  quality: number;
  reliability: number;
  avgMs: number;
  tokens: number;
  corrections: number;
  improved: number;
  repeats: number;
  toolAccuracy: number;
  compliance: number;
  hallucinationFlags: number;
  cost: number;
}

export interface WorkerAgent {
  registryId: string;
  specialization: string;
  methodology: string[];
  style: ReasoningStyle;
  verbosity: "terse" | "standard" | "thorough";
  riskTolerance: "conservative" | "balanced" | "exploratory";
  policyVersion: string;
  brainPreference: string[];
  qualityThreshold: number;
  health: WorkerHealth;
  workload: number;
  heartbeatAt: number;
  lessons: string[];
  mistakes: string[];
  achievements: string[];
  unknowns: number;
  escalations: number;
  lastTrace: string;
}

export interface Worker {
  id: string;
  name: string;
  role: WorkerRole;
  title: string;
  departmentId: string;
  supervisorId: string | null;
  managerId: string | null;
  executiveId: string | null;
  capabilities: string[];
  permissions: string[];
  status: WorkerStatus;
  currentAssignment: string | null;
  modelId: string;
  toolPermissions: string[];
  memoryScope: MemoryLayer;
  rank: WorkerRank;
  performance: PerformanceProfile;
  teamId: string | null;
  specialist: boolean;
  reserved: boolean;
  disabledReason: string | null;
  lastActiveAt: number;
  agent: WorkerAgent;
}

export interface Department {
  id: string;
  name: string;
  code: string;
  purpose: string;
  executiveId: string;
  managerId: string;
  supervisorIds: string[];
}

export interface Team {
  id: string;
  departmentId: string;
  supervisorId: string;
  name: string;
  workerIds: string[];
  qcId: string | null;
  testerId: string | null;
}

export interface Brain {
  id: string;
  name: string;
  provider: BrainProvider;
  tier: "flagship" | "fast" | "free" | "local";
  capabilities: string[];
  available: boolean;
  latencyMs: number;
  cost: number;
  accuracy: number;
  failRate: number;
  tokensUsed: number;
  tasks: number;
  specialty: string;
  costClass: CostClass;
  privacy: "any" | "private" | "local";
  fallbackRank: number;
  health: BrainHealth;
  lastError: string | null;
  consecutiveFails: number;
  contextWindow: number;
  connection?: ConnectionState;
  kind?: BrainKind;
  endpoint?: string;
}

export interface SkillTest {
  name: string;
  status: "pass" | "fail" | "pending";
}

export interface Skill {
  id: string;
  name: string;
  version: string;
  purpose: string;
  capabilities: string[];
  dependencies: string[];
  permissions: string[];
  tests: SkillTest[];
  benchmark: { score: number; samples: number };
  creatorId: string;
  reviewerId: string | null;
  limitations: string[];
  deploymentStatus: SkillStatus;
  rollbackVersion: string | null;
  changeHistory: { at: number; by: string; note: string }[];
  successRate: number;
  inputs: string[];
  outputs: string[];
}

export interface MemoryItem {
  id: string;
  layer: MemoryLayer;
  ownerId: string;
  title: string;
  content: string;
  status: KnowledgeStatus;
  claim: ClaimKind;
  tags: string[];
  evidence: string[];
  createdBy: string;
  createdAt: number;
  relatedSkillId: string | null;
  relatedTaskId: string | null;
}

export interface Task {
  id: string;
  projectId: string;
  objectiveId: string;
  title: string;
  description: string;
  departmentId: string;
  supervisorId: string | null;
  workerId: string | null;
  qcId: string | null;
  testerId: string | null;
  owner: "owner" | "ceo" | "manager" | "supervisor" | "worker";
  status: TaskStatus;
  priority: number;
  urgency: number;
  importance: number;
  risk: RiskLevel;
  skillId: string | null;
  requiredCapability: string;
  brainId: string;
  fallbacks: string[];
  dependencies: string[];
  progress: number;
  plan: string;
  output: string;
  evidence: string[];
  failures: { at: number; reason: string; by: string }[];
  corrections: number;
  tests: { name: string; result: "pass" | "fail" | "pending" }[];
  qcVerdict: "pass" | "fail" | "pending" | "pass_with_warnings" | "requires_human" | null;
  qcNotes: string;
  approval: "not_required" | "pending" | "granted" | "rejected";
  lessons: string[];
  locked: boolean;
  createdAt: number;
  updatedAt: number;
  deadline: number | null;
  tokenUsed: number;
  gate: number;
  claim: ClaimKind;
  executionSource: ExecutionSource;
  livePending: boolean;
  trace: string[];
  checkpoint: { step: string; at: number; note: string } | null;
  priorityBand: PriorityBand;
  unknowns: string[];
}

export interface Project {
  id: string;
  objectiveId: string;
  name: string;
  summary: string;
  departmentIds: string[];
  status: "planning" | "active" | "blocked" | "delivered" | "failed" | "awaiting_approval";
  risk: RiskLevel;
  progress: number;
  createdAt: number;
}

export interface Objective {
  id: string;
  text: string;
  priority: number;
  risk: RiskLevel;
  status: "intake" | "strategy" | "active" | "delivered" | "rejected" | "awaiting_approval" | "cancelled";
  strategy: string;
  createdAt: number;
  requiresApproval: boolean;
}

export interface OrgEvent {
  id: string;
  type: EventType;
  at: number;
  who: string;
  what: string;
  why: string;
  taskId: string | null;
  modelId: string | null;
  result: string | null;
}

export interface AuditEntry {
  id: string;
  at: number;
  who: string;
  what: string;
  why: string;
  taskId: string | null;
  modelId: string | null;
  tool: string | null;
  result: string | null;
  test: string | null;
  qc: string | null;
  approval: string | null;
}

export interface OrgMessage {
  id: string;
  at: number;
  from: string;
  to: string;
  kind: "request" | "result" | "status" | "evidence" | "decision" | "escalation";
  body: string;
  taskId: string | null;
}

export interface Approval {
  id: string;
  kind: "objective" | "skill" | "improvement" | "high_risk" | "disable" | "rollback";
  title: string;
  detail: string;
  risk: RiskLevel;
  refId: string;
  status: "pending" | "granted" | "rejected";
  at: number;
}

export interface Improvement {
  id: string;
  title: string;
  observation: string;
  proposal: string;
  status:
    | "observe"
    | "propose"
    | "sandbox"
    | "test"
    | "benchmark"
    | "qc"
    | "approve"
    | "deployed"
    | "rolled_back";
  createdAt: number;
  metric: string;
}

export interface DeptStats {
  active: number;
  available: number;
  queue: number;
  quality: number;
  failRate: number;
}

export interface Kpis {
  successRate: number;
  quality: number;
  reliability: number;
  avgCompletionMs: number;
  tokenEfficiency: number;
  delivered: number;
  failed: number;
  qcCatchRate: number;
  activeWorkers: number;
  availableWorkers: number;
  trainingWorkers: number;
  fallbacks: number;
  liveTurns: number;
  localTurns: number;
  unknowns: number;
}

export interface ScenarioResult {
  id: string;
  name: string;
  status: "idle" | "running" | "pass" | "fail";
  log: string[];
  ranAt: number | null;
}

export interface FaultState {
  modelFailure: boolean;
  providerFailure: boolean;
  networkFailure: boolean;
  toolFailure: boolean;
  workerFailureId: string | null;
  supervisorFailureId: string | null;
  corruptTask: boolean;
  timeout: boolean;
  rateLimit: boolean;
  badOutput: boolean;
  failedDeploy: boolean;
}

export interface CeoState {
  id: "ORG-CEO";
  name: string;
  status: "idle" | "planning" | "directing" | "reviewing" | "unavailable";
  modelId: string;
  lastBrief: string;
  advisors: string[];
}

export interface OrgIdentity {
  name: string;
  mission: string;
  ownerName: string;
  foundedAt: number;
}

export interface RuntimeFlags {
  liveMode: boolean;
  liveInflight: number;
  liveCap: number;
  mode: "sandbox" | "development" | "test" | "staging" | "production";
  isolated: { kind: "worker" | "department" | "team" | "tool" | "skill" | "provider" | "task"; id: string }[];
  routingMode: RoutingMode;
  toolRuns: number;
}

export interface OrgSnapshot {
  version: 2;
  identity: OrgIdentity;
  orgStatus: OrgStatus;
  workers: Record<string, Worker>;
  workerOrder: string[];
  departments: Department[];
  teams: Team[];
  brains: Brain[];
  skills: Skill[];
  memory: MemoryItem[];
  tasks: Record<string, Task>;
  taskOrder: string[];
  projects: Project[];
  objectives: Objective[];
  events: OrgEvent[];
  audit: AuditEntry[];
  messages: OrgMessage[];
  approvals: Approval[];
  improvements: Improvement[];
  ceo: CeoState;
  kpis: Kpis;
  deptStats: Record<string, DeptStats>;
  scenarios: ScenarioResult[];
  faults: FaultState;
  budgets: {
    tokens: number;
    tokenCap: number;
    apiCalls: number;
    apiCap: number;
  };
  runtime: RuntimeFlags;
  tickMs: number;
  epoch: number;
  lastTickAt: number;
  bootstrappedAt: number;
}

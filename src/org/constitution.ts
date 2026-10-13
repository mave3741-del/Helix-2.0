export const CONSTITUTION = [
  {
    n: 1,
    title: "Owner authority",
    rule: "The Owner is the ultimate authority. The organization operates only under Owner direction.",
  },
  {
    n: 2,
    title: "Owner objectives",
    rule: "Organizational objectives must follow Owner direction. Workers may not redefine them.",
  },
  {
    n: 3,
    title: "Quality over speed",
    rule: "Quality is more important than superficial speed. Unverified speed is waste.",
  },
  {
    n: 4,
    title: "Verified results",
    rule: "Important results must be independently verified before delivery.",
  },
  {
    n: 5,
    title: "No unverified facts",
    rule: "Unverified information must not be treated as fact. Claims carry a status.",
  },
  {
    n: 6,
    title: "Correction cycle",
    rule: "Failed work must enter diagnosis, correction, and retesting — never silent discard.",
  },
  {
    n: 7,
    title: "Replaceable brains",
    rule: "Models are replaceable reasoning resources. The organization owns the work.",
  },
  {
    n: 8,
    title: "Model-independent memory",
    rule: "Organizational memory is independent of any model, provider, or worker session.",
  },
  {
    n: 9,
    title: "Tested skills",
    rule: "Skills must be tested in isolation before production. Untested skills stay in sandbox.",
  },
  {
    n: 10,
    title: "Auditability",
    rule: "Important actions must be auditable: who, what, when, why, result.",
  },
  {
    n: 11,
    title: "Capital-budget approval",
    rule: "The Owner approves the live trading capital budget/window. Individual trades proceed autonomously only within hard policy and risk limits; the risk engine may veto any trade.",
  },
  {
    n: 12,
    title: "Controlled self-improvement",
    rule: "Self-improvement is allowed only through observe → sandbox → test → approve → deploy.",
  },
  {
    n: 13,
    title: "Security boundaries",
    rule: "Security boundaries must not be bypassed. Permissions are evaluated per action.",
  },
  {
    n: 14,
    title: "Task continuity",
    rule: "The organization must preserve task state during failures and resume from checkpoint.",
  },
  {
    n: 15,
    title: "Evidence over claims",
    rule: "The organization prefers measured evidence over unsupported claims.",
  },
] as const;

export const SYSTEMS = [
  { id: "ownership", name: "Ownership", spec: "1, 33, 47" },
  { id: "workforce", name: "1,000-worker registry", spec: "2, 4, 58" },
  { id: "hierarchy", name: "Human-like hierarchy", spec: "3, 35, 37, 38" },
  { id: "balancing", name: "Workforce balancing", spec: "5, 39" },
  { id: "qc", name: "Independent QC", spec: "6, 30, 31" },
  { id: "performance", name: "Performance system", spec: "7, 8, 14, 41" },
  { id: "training", name: "Training & correction", spec: "9" },
  { id: "learning", name: "Organizational learning", spec: "10, 11, 12" },
  { id: "escalation", name: "Expert escalation", spec: "13, 32" },
  { id: "succession", name: "Supervisor succession", spec: "15" },
  { id: "memory", name: "Hierarchical memory", spec: "16, 17, 55" },
  { id: "tasks", name: "Persistent task state", spec: "18, 52, 53, 54" },
  { id: "brains", name: "Replaceable brains", spec: "19, 20, 21, 22, 42" },
  { id: "fallback", name: "Automatic fallback", spec: "22, 23" },
  { id: "skills", name: "Skill factory", spec: "24, 25" },
  { id: "testing", name: "Testing organization", spec: "26, 27, 28, 29" },
  { id: "ceo", name: "Orion & advisory", spec: "33, 34" },
  { id: "coordination", name: "Cross-department coordination", spec: "36, 57" },
  { id: "resources", name: "Resource management", spec: "40" },
  { id: "improve", name: "Controlled self-improvement", spec: "43, 44" },
  { id: "constitution", name: "Constitution & governance", spec: "45, 46" },
  { id: "security", name: "Permissions & security", spec: "49" },
  { id: "audit", name: "Audit system", spec: "50" },
  { id: "recovery", name: "Disaster recovery", spec: "51, 48" },
  { id: "comms", name: "Structured communication", spec: "56" },
  { id: "identity", name: "Organizational identity", spec: "59" },
  { id: "loop", name: "Core autonomous loop", spec: "60, 61, 62" },
] as const;

export const QUALITY_GATES = [
  "Requirement verification",
  "Worker self-check",
  "Supervisor review",
  "Independent QC",
  "Testing",
  "Security / risk review",
  "Final organizational verification",
] as const;

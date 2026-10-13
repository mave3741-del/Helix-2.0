export type JarvisIntent =
  | "conversation"
  | "system_status"
  | "market_research"
  | "news_sentiment"
  | "risk_review"
  | "portfolio_review"
  | "workforce_review"
  | "brain_control"
  | "improvement"
  | "debate"
  | "paper_trade_plan"
  | "governance_control";

export type JarvisAction =
  | { type: "select_agent"; agent: string }
  | { type: "open_view"; view: string }
  | { type: "issue_objective"; text: string; priority: number }
  | { type: "set_routing"; mode: "auto" | "local-only" | "hybrid" | "cloud-first" }
  | { type: "pause" }
  | { type: "resume" }
  | { type: "shutdown" }
  | { type: "speak"; text: string }
  | { type: "show_evidence"; ids: string[] };

export interface JarvisContextSnapshot {
  mission?: string;
  orgStatus?: string;
  routingMode?: string;
  workerCount?: number;
  availableWorkers?: number;
  activeWorkers?: number;
  pendingApprovals?: number;
  successRate?: number;
  quality?: number;
  liveMode?: boolean;
  toolRuns?: number;
  recentEvents?: string[];
  recentConversation?: Array<{ role: "user" | "orion" | "agent"; text: string; agent?: string }>;
  selectedAgent?: string;
}

export interface JarvisTurnResult {
  ok: boolean;
  reply: string;
  agent: string;
  intent: JarvisIntent;
  phase: "listening" | "thinking" | "acting" | "monitoring" | "speaking" | "blocked" | "done";
  actions: JarvisAction[];
  mentions: string[];
  reasoning: Array<{ agent: string; summary: string; stance?: "bull" | "bear" | "neutral" | "abstain"; confidence?: number }>;
  provider: string | null;
  brainId: string | null;
  fallbackUsed: boolean;
  requiresOwnerApproval: boolean;
  safety: "green" | "amber" | "red";
  notice?: string;
  latencyMs: number;
}

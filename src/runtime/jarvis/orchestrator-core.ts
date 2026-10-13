import type { JarvisAction, JarvisContextSnapshot, JarvisIntent } from "./types";

export interface JarvisAgentProfile {
  name: string;
  specialty: string;
  council: string;
  style: string;
  voice: string;
}

export const JARVIS_AGENTS: JarvisAgentProfile[] = [
  { name: "Orion", specialty: "primary orchestration, strategy and owner communication", council: "Command", style: "calm, decisive, transparent", voice: "measured command voice" },
  { name: "Lyra", specialty: "research, evidence and skeptical validation", council: "Research", style: "curious, evidence-first, skeptical", voice: "clear analytical voice" },
  { name: "Nova", specialty: "market intelligence, signals and pattern synthesis", council: "Strategy", style: "fast, synthetic, opportunity-aware", voice: "bright analytical voice" },
  { name: "Atlas", specialty: "execution, portfolio construction and liquidity", council: "Execution", style: "procedural, risk-aware, concise", voice: "firm operational voice" },
  { name: "Polaris", specialty: "risk, drawdown and capital governance", council: "Risk", style: "conservative, adversarial, exact", voice: "steady protective voice" },
  { name: "Nebula", specialty: "news, sentiment and external intelligence", council: "News", style: "fast, contextual, source-aware", voice: "quick newsroom voice" },
  { name: "Titan", specialty: "engineering, tools, testing and systems", council: "Engineering", style: "practical, precise, implementation-first", voice: "technical voice" },
  { name: "Cassini", specialty: "macro, cross-market and causal context", council: "Macro", style: "patient, systemic, comparative", voice: "low-tempo analyst voice" },
  { name: "Astra", specialty: "quality control, verification and standards", council: "Quality", style: "meticulous, independent, direct", voice: "precise reviewer voice" },
  { name: "Mira", specialty: "memory, knowledge and continuity", council: "Knowledge", style: "reflective, organized, contextual", voice: "warm archival voice" },
  { name: "Selene", specialty: "recovery, resilience and fault containment", council: "Recovery", style: "calm under pressure, fail-closed", voice: "reassuring incident voice" },
];

const AGENT_BY_NAME = new Map(JARVIS_AGENTS.map((agent) => [agent.name.toLowerCase(), agent]));

const INTENT_KEYWORDS: Array<[JarvisIntent, string[], string]> = [
  ["system_status", ["status", "health", "how are you", "system check", "what's happening"], "Orion"],
  ["market_research", ["market", "scan", "opportunit", "btc", "bitcoin", "eth", "chart", "setup"], "Nova"],
  ["news_sentiment", ["news", "sentiment", "headline", "social", "reddit", "stocktwits", "x.com"], "Nebula"],
  ["risk_review", ["risk", "drawdown", "exposure", "stop loss", "capital", "leverage"], "Polaris"],
  ["portfolio_review", ["portfolio", "position", "positions", "pnl", "p&l", "wallet", "account"], "Atlas"],
  ["workforce_review", ["workers", "workforce", "agents", "team", "constellation"], "Orion"],
  ["brain_control", ["brain", "model", "provider", "api key", "nvidia", "nim", "grok", "openai"], "Titan"],
  ["improvement", ["improve", "fix yourself", "modify yourself", "self improve", "refactor", "upgrade", "audit yourself"], "Titan"],
  ["debate", ["debate", "challenge", "prove me wrong", "argue", "bull case", "bear case"], "Lyra"],
  ["paper_trade_plan", ["paper trade", "paper order", "simulate order", "enter trade", "place trade", "buy", "sell", "trade"], "Atlas"],
  ["governance_control", ["pause", "resume", "halt", "shutdown", "routing", "local only", "cloud first"], "Polaris"],
];

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9+&.'-]+/g, " ").replace(/\s+/g, " ").trim();
}

function containsAny(text: string, tokens: string[]): boolean {
  return tokens.some((token) => text.includes(token));
}

export function classifyJarvisIntent(text: string): { intent: JarvisIntent; agent: JarvisAgentProfile } {
  const normalized = normalize(text);
  for (const [intent, keywords, agentName] of INTENT_KEYWORDS) {
    if (containsAny(normalized, keywords)) return { intent, agent: AGENT_BY_NAME.get(agentName.toLowerCase())! };
  }
  const explicit = JARVIS_AGENTS.find((agent) => normalized.includes(agent.name.toLowerCase()));
  return { intent: "conversation", agent: explicit ?? AGENT_BY_NAME.get("orion")! };
}

export function agentByName(name: string | undefined): JarvisAgentProfile {
  return AGENT_BY_NAME.get((name ?? "Orion").toLowerCase()) ?? AGENT_BY_NAME.get("orion")!;
}

export function fallbackReply(intent: JarvisIntent, agent: JarvisAgentProfile, ctx: JarvisContextSnapshot): string {
  switch (intent) {
    case "system_status":
      return `${agent.name}: HELIX is ${ctx.orgStatus ?? "online"}. ${ctx.activeWorkers ?? 0} workers are active and ${ctx.pendingApprovals ?? 0} owner gates are pending. Live execution remains disabled.`;
    case "risk_review":
      return `${agent.name}: I can report current risk posture from the local control plane. I will not invent exposure or drawdown values that are not present in the current runtime snapshot.`;
    case "workforce_review":
      return `${agent.name}: The HELIX workforce contract remains at ${ctx.workerCount ?? 1000} named worker identities. Current UI telemetry reports ${ctx.availableWorkers ?? 0} available and ${ctx.activeWorkers ?? 0} active.`;
    case "brain_control":
      return `${agent.name}: Brain routing is governed by the Brain settings layer. Provider keys stay server-side and routing can fail over without exposing secrets.`;
    case "improvement":
      return `${agent.name}: I can generate a governed self-improvement proposal. Production changes will only be promoted after sandbox tests, audit and release gates.`;
    case "paper_trade_plan":
      return `${agent.name}: I can prepare a paper-trade decision path, but execution must remain inside the existing paper-only risk and owner capital envelope.`;
    default:
      return `${agent.name}: HELIX is ready. Give me a concrete objective and I will route it through the appropriate workers, brain, tools and governance gates.`;
  }
}

export function actionsFor(input: { text: string; intent: JarvisIntent; agent: JarvisAgentProfile }): JarvisAction[] {
  const normalized = normalize(input.text);
  const actions: JarvisAction[] = [{ type: "select_agent", agent: input.agent.name }];
  if (input.intent === "brain_control") actions.push({ type: "open_view", view: "brains" });
  if (input.intent === "workforce_review") actions.push({ type: "open_view", view: "workforce" });
  if (input.intent === "risk_review") actions.push({ type: "open_view", view: "governance" });
  if (input.intent === "improvement") actions.push({ type: "open_view", view: "improve" });
  if (input.intent === "portfolio_review") actions.push({ type: "open_view", view: "governance" });
  if (input.intent === "system_status") actions.push({ type: "open_view", view: "command" });
  if (input.intent === "governance_control") {
    if (normalized.includes("pause")) actions.push({ type: "pause" });
    if (normalized.includes("resume")) actions.push({ type: "resume" });
    if (normalized.includes("shutdown") || normalized.includes("halt")) actions.push({ type: "shutdown" });
    const route = normalized.includes("local only") ? "local-only" : normalized.includes("cloud first") ? "cloud-first" : normalized.includes("hybrid") ? "hybrid" : null;
    if (route) actions.push({ type: "set_routing", mode: route });
  }
  return actions;
}

export function jarvisAgentNames(): string[] {
  return JARVIS_AGENTS.map((agent) => agent.name);
}

export function jarvisPanelFor(intent: JarvisIntent): string[] {
  if (intent === "risk_review") return ["Polaris", "Atlas", "Lyra"];
  if (intent === "market_research") return ["Nova", "Lyra", "Cassini"];
  if (intent === "news_sentiment") return ["Nebula", "Lyra", "Cassini"];
  if (intent === "portfolio_review") return ["Atlas", "Polaris", "Astra"];
  if (intent === "debate") return ["Lyra", "Nova", "Polaris"];
  return ["Lyra", "Nova", "Polaris"];
}

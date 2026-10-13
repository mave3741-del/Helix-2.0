import { createServerFn } from "@tanstack/react-start";
import { BRAIN_TO_PROVIDER } from "@/runtime/brain/providers";
import { runBrainGeneration } from "@/runtime/brain/server";
import type { BrainGenerateInput } from "@/runtime/brain/server";
import type { JarvisContextSnapshot, JarvisIntent, JarvisTurnResult } from "./types";
import {
  actionsFor,
  agentByName,
  classifyJarvisIntent,
  fallbackReply,
  jarvisAgentNames,
  jarvisPanelFor,
  type JarvisAgentProfile,
} from "./orchestrator-core";
import { autonomousObjectiveForIntent } from "./autonomy-policy";

function contextText(ctx: JarvisContextSnapshot): string {
  return JSON.stringify({
    mission: ctx.mission ?? null,
    orgStatus: ctx.orgStatus ?? null,
    routingMode: ctx.routingMode ?? "auto",
    workerCount: ctx.workerCount ?? 1000,
    availableWorkers: ctx.availableWorkers ?? null,
    activeWorkers: ctx.activeWorkers ?? null,
    pendingApprovals: ctx.pendingApprovals ?? 0,
    successRate: ctx.successRate ?? null,
    quality: ctx.quality ?? null,
    liveMode: ctx.liveMode ?? false,
    toolRuns: ctx.toolRuns ?? 0,
    recentEvents: ctx.recentEvents?.slice(-8) ?? [],
    recentConversation: ctx.recentConversation?.slice(-10) ?? [],
    selectedAgent: ctx.selectedAgent ?? "Orion",
  });
}

function intentSystem(agent: JarvisAgentProfile, intent: JarvisIntent): string {
  return [
    "You are HELIX, an autonomous trading-intelligence organization with a JARVIS-style interface.",
    `Your current speaking identity is ${agent.name}. Specialty: ${agent.specialty}. Council: ${agent.council}. Style: ${agent.style}.`,
    "The Owner controls policy, capital envelopes, permissions, and emergency controls. Do not claim those have changed unless the system explicitly confirms it.",
    "You may coordinate research, memory, news, sentiment, risk analysis, market scanning, worker orchestration and paper trading workflows.",
    "Live trading remains structurally disabled in this release. Never imply a live order was sent.",
    "Use evidence-first language. Never fabricate market data, news, fills, balances, provider connectivity, or test results.",
    "For self-improvement requests, create a governed improvement proposal: analyze -> sandbox -> test -> audit -> promote. Never silently modify production code from a chat turn.",
    "For paper trading requests, only produce a governed paper-trade plan unless the existing paper-trading control plane explicitly reports acceptance.",
    "Return STRICT JSON: {reply:string, mentions:string[], reasoning?:[{agent,summary,stance,confidence}], safety:'green'|'amber'|'red'}.",
    `Intent: ${intent}`,
  ].join("\n");
}

function parseModelEnvelope(text: string): { reply: string; mentions: string[]; reasoning: JarvisTurnResult["reasoning"]; safety: JarvisTurnResult["safety"] } {
  const clean = text.trim().replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
  try {
    const parsed = JSON.parse(clean) as Partial<{
      reply: string;
      mentions: string[];
      reasoning: JarvisTurnResult["reasoning"];
      safety: JarvisTurnResult["safety"];
    }>;
    return {
      reply: typeof parsed.reply === "string" && parsed.reply.trim() ? parsed.reply.trim() : clean.slice(0, 1000),
      mentions: Array.isArray(parsed.mentions)
        ? parsed.mentions.map(String).filter((name) => jarvisAgentNames().some((agent) => agent.toLowerCase() === name.toLowerCase())).slice(0, 8)
        : [],
      reasoning: Array.isArray(parsed.reasoning) ? parsed.reasoning.slice(0, 8) : [],
      safety: parsed.safety === "red" || parsed.safety === "amber" ? parsed.safety : "green",
    };
  } catch {
    return { reply: clean.slice(0, 1400), mentions: [], reasoning: [], safety: "amber" };
  }
}

// Web Crypto (the global `crypto`), not `node:crypto` — this module is
// statically reachable from client bundles (createServerFn's RPC stub still
// needs the surrounding module to evaluate in the browser), and Vite
// externalizes `node:crypto` there: importing it throws at module-load time
// ("Cannot access ... in client code"), which was breaking hydration for
// every page that calls into this file — including pages with no visible
// relation to Jarvis, since a crash during hydration can leave sibling
// components un-rendered. `crypto.subtle` is the same SHA-256 primitive,
// available as a global in both Node 22+ and every browser.
async function hashTurn(input: object): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(input));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 24);
}

async function runAgentPanel(input: {
  intent: JarvisIntent;
  ownerText: string;
  context: JarvisContextSnapshot;
  lead: JarvisAgentProfile;
  brainId: string;
  fallbacks: string[];
}): Promise<{
  reasoning: JarvisTurnResult["reasoning"];
  provider: string | null;
  brainId: string | null;
  fallbackUsed: boolean;
  synthesis?: string;
}> {
  const panel = jarvisPanelFor(input.intent).map((name) => agentByName(name));
  const responses: Array<{ agent: JarvisAgentProfile; result: Awaited<ReturnType<typeof runBrainGeneration>> }> = [];
  for (const specialist of panel) {
    const result = await runBrainGeneration({
      brainId: input.brainId,
      fallbacks: input.fallbacks,
      system: [
        intentSystem(specialist, input.intent),
        "You are one bounded specialist in a Command Room panel.",
        "Give an independent view. Do not claim a trade was executed.",
      ].join("\n"),
      user: JSON.stringify({ ownerMessage: input.ownerText, runtimeSnapshot: JSON.parse(contextText(input.context)), role: specialist.name }),
      maxTokens: 500,
      json: true,
      routingMode: input.context.routingMode as BrainGenerateInput["routingMode"],
    });
    responses.push({ agent: specialist, result });
  }

  const reasoning: JarvisTurnResult["reasoning"] = [];
  const panelText = responses.map(({ agent: specialist, result }) => {
    if (!result.ok) return `${specialist.name}: unavailable (${result.error})`;
    const parsed = parseModelEnvelope(result.text);
    reasoning.push(...parsed.reasoning);
    if (parsed.reasoning.length === 0) reasoning.push({ agent: specialist.name, summary: parsed.reply });
    return `${specialist.name}: ${parsed.reply}`;
  }).join("\n");

  const synthesis = await runBrainGeneration({
    brainId: "grok-4.5",
    fallbacks: ["nvidia-nim", "grok-fast", "open-reasoner"],
    system: [
      intentSystem(input.lead, input.intent),
      "You are the lead synthesizer. Compare specialist views, make disagreements explicit, and give the safest useful next step.",
    ].join("\n"),
    user: JSON.stringify({ ownerMessage: input.ownerText, panel: panelText, runtimeSnapshot: JSON.parse(contextText(input.context)) }),
    maxTokens: 800,
    json: true,
    routingMode: input.context.routingMode as BrainGenerateInput["routingMode"],
  });

  if (!synthesis.ok) {
    const firstOk = responses.find((entry) => entry.result.ok);
    return {
      reasoning,
      provider: firstOk?.result.ok ? firstOk.result.provider : null,
      brainId: firstOk?.result.ok ? firstOk.result.brainId : null,
      fallbackUsed: true,
    };
  }

  return {
    reasoning,
    provider: synthesis.provider,
    brainId: synthesis.brainId,
    fallbackUsed: synthesis.fallbackUsed || responses.some((entry) => entry.result.ok && entry.result.fallbackUsed),
    synthesis: synthesis.text,
  };
}

export async function orchestrateJarvisTurn(input: {
  text: string;
  context: JarvisContextSnapshot;
  sessionId?: string;
  preferredAgent?: string;
}): Promise<JarvisTurnResult> {
  const started = Date.now();
  const { intent, agent: detectedAgent } = classifyJarvisIntent(input.text);
  const agent = agentByName(input.preferredAgent ?? detectedAgent.name);

  const chainByIntent: Record<JarvisIntent, [string, string[]]> = {
    conversation: ["grok-4.5", ["nvidia-nim", "grok-fast", "open-reasoner", "ollama"]],
    system_status: ["grok-fast", ["nvidia-nim", "grok-4.5", "local-heuristic"]],
    market_research: ["grok-4.5", ["nvidia-nim", "perplexity", "open-reasoner", "grok-fast"]],
    news_sentiment: ["nvidia-nim", ["perplexity", "grok-4.5", "grok-fast"]],
    risk_review: ["nvidia-nim", ["grok-4.5", "anthropic-claude", "grok-fast"]],
    portfolio_review: ["nvidia-nim", ["grok-4.5", "grok-fast", "local-heuristic"]],
    workforce_review: ["grok-fast", ["nvidia-nim", "grok-4.5", "local-heuristic"]],
    brain_control: ["nvidia-nim", ["grok-4.5", "grok-fast", "local-heuristic"]],
    improvement: ["grok-4.5", ["nvidia-nim", "cloud-coder", "anthropic-claude", "grok-fast"]],
    debate: ["grok-4.5", ["nvidia-nim", "anthropic-claude", "open-reasoner"]],
    paper_trade_plan: ["nvidia-nim", ["grok-4.5", "anthropic-claude", "grok-fast"]],
    governance_control: ["grok-fast", ["nvidia-nim", "local-heuristic"]],
  };

  const [brainId, fallbacks] = chainByIntent[intent];
  const snapshot = contextText(input.context);
  const system = intentSystem(agent, intent);
  const user = JSON.stringify({
    turnId: await hashTurn({ sessionId: input.sessionId ?? "ephemeral", text: input.text, at: Math.floor(Date.now() / 1000) }),
    ownerMessage: input.text,
    runtimeSnapshot: JSON.parse(snapshot),
  });

  const generation: BrainGenerateInput = {
    brainId,
    fallbacks,
    system,
    user,
    maxTokens: intent === "debate" ? 900 : 700,
    json: true,
    routingMode: input.context.routingMode as BrainGenerateInput["routingMode"],
  };

  const panelEnabled = intent === "debate" || intent === "market_research" || intent === "risk_review" || intent === "news_sentiment" || intent === "portfolio_review";
  const panel = panelEnabled
    ? await runAgentPanel({ intent, ownerText: input.text, context: input.context, lead: agent, brainId, fallbacks })
    : null;
  const result = panel?.synthesis
    ? {
      ok: true as const,
      text: panel.synthesis,
      brainId: panel.brainId ?? brainId,
      provider: panel.provider ?? (BRAIN_TO_PROVIDER[brainId] ?? brainId),
      fallbackUsed: panel.fallbackUsed,
      tokens: 0,
      latencyMs: Date.now() - started,
    }
    : await runBrainGeneration(generation);

  const envelope = result.ok
    ? parseModelEnvelope(result.text)
    : { reply: fallbackReply(intent, agent, input.context), mentions: [], reasoning: [], safety: "amber" as const };

  const actions = actionsFor({ text: input.text, intent, agent });
  const autonomousObjective = autonomousObjectiveForIntent(intent, input.text);
  if (autonomousObjective) actions.push({ type: "issue_objective", ...autonomousObjective });
  if (intent === "paper_trade_plan") actions.push({ type: "open_view", view: "command" });

  const combinedReasoning = [
    ...(panel?.reasoning ?? []),
    ...envelope.reasoning,
  ].slice(0, 12);

  return {
    ok: true,
    reply: envelope.reply,
    agent: agent.name,
    intent,
    phase: result.ok ? "done" : "monitoring",
    actions,
    mentions: envelope.mentions,
    reasoning: combinedReasoning,
    provider: result.ok ? result.provider : null,
    brainId: result.ok ? result.brainId : null,
    fallbackUsed: result.ok ? result.fallbackUsed : true,
    requiresOwnerApproval: intent === "improvement" && envelope.safety === "red",
    safety: envelope.safety,
    notice: result.ok ? undefined : `Brain unavailable; deterministic HELIX fallback used: ${result.error}`,
    latencyMs: Date.now() - started,
  };
}

export const orchestrateJarvis = createServerFn({ method: "POST" })
  .validator((input: Parameters<typeof orchestrateJarvisTurn>[0]) => input)
  .handler(async ({ data }) => orchestrateJarvisTurn(data));

export { JARVIS_AGENTS, jarvisAgentNames } from "./orchestrator-core";
export type { JarvisAgentProfile } from "./orchestrator-core";

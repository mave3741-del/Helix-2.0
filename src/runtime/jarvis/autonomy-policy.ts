import type { JarvisAction, JarvisIntent } from "./types";

export const ORION_AUTONOMY_TARGET = 0.9;

export type OrionBoundary =
  | "capital-envelope"
  | "emergency-stop"
  | "credentials"
  | "major-self-change";

export interface OrionActionDecision {
  allowed: boolean;
  autonomous: boolean;
  boundary?: OrionBoundary;
  reason: string;
}

export interface OrionPolicyContext {
  userInitiated: boolean;
  liveTradingEnabled: boolean;
  riskEnvelopeApproved: boolean;
}

/**
 * Orion may autonomously coordinate routine work, but never bypasses the
 * platform's hard governance boundaries. High/critical objectives still enter
 * the existing approval pipeline rather than being silently promoted.
 */
export function decideOrionAction(
  action: JarvisAction,
  context: OrionPolicyContext,
): OrionActionDecision {
  if (action.type === "shutdown") {
    if (!context.userInitiated) {
      return { allowed: false, autonomous: false, boundary: "emergency-stop", reason: "Emergency stop requires a direct Owner command." };
    }
    return { allowed: true, autonomous: false, boundary: "emergency-stop", reason: "Direct Owner emergency command." };
  }

  if (action.type === "set_routing") {
    if (action.mode !== "local-only" && context.liveTradingEnabled) {
      return { allowed: false, autonomous: false, boundary: "capital-envelope", reason: "Routing changes cannot enable live trading." };
    }
    return { allowed: true, autonomous: true, reason: "Routing policy may be changed without altering the live-execution lock." };
  }

  if (action.type === "issue_objective") {
    return {
      allowed: true,
      autonomous: true,
      boundary: action.text.toLowerCase().includes("capital") ? "capital-envelope" : undefined,
      reason: "Objective creation is autonomous; existing risk/approval gates decide whether it can become active.",
    };
  }

  if (action.type === "pause" || action.type === "resume") {
    return { allowed: true, autonomous: true, reason: "Routine runtime coordination." };
  }

  if (action.type === "show_evidence" || action.type === "speak" || action.type === "select_agent" || action.type === "open_view") {
    return { allowed: true, autonomous: true, reason: "Informational or presentation action." };
  }

  return { allowed: false, autonomous: false, reason: "Unknown action blocked fail-closed." };
}

export function autonomousObjectiveForIntent(intent: JarvisIntent, ownerText: string): { text: string; priority: number } | null {
  const text = ownerText.trim();
  if (!text) return null;

  const activeVerb = /\b(scan|research|analy[sz]e|find|monitor|evaluate|investigate|compare|debate|run|prepare|build|audit)\b/i.test(text);
  if (!activeVerb && intent !== "paper_trade_plan" && intent !== "improvement") return null;

  switch (intent) {
    case "market_research":
      return { text: `Orion autonomous market research: ${text}`, priority: 3 };
    case "news_sentiment":
      return { text: `Orion autonomous news and sentiment investigation: ${text}`, priority: 3 };
    case "debate":
      return { text: `Orion autonomous adversarial debate: ${text}`, priority: 4 };
    case "paper_trade_plan":
      return { text: `Orion governed paper-trade objective: ${text}`, priority: 4 };
    case "improvement":
      return { text: `Orion governed self-improvement proposal: ${text}`, priority: 5 };
    default:
      return null;
  }
}

import { stableHash } from "../runtime/task-results.ts";

export interface AgentDecision {
  decisionId: string;
  agentId: string;
  market: string;
  action: "buy" | "sell" | "hold" | "reject";
  confidence: number;
  rationale: string;
  evidenceIds: string[];
  modelProvider?: string;
  modelVersion?: string;
  strategyId?: string;
  createdAt: number;
}

export interface DecisionOutcome {
  decisionId: string;
  realizedPnl: number;
  maxAdverseExcursion: number;
  maxFavorableExcursion: number;
  outcomeAt: number;
}

export interface DecisionRecord extends AgentDecision { decisionHash: string; outcome?: DecisionOutcome; }

export class DecisionLedger {
  private readonly decisions = new Map<string, DecisionRecord>();

  async record(input: Omit<AgentDecision, "createdAt">): Promise<DecisionRecord> {
    if (this.decisions.has(input.decisionId)) throw new Error("decision_exists");
    if (input.confidence < 0 || input.confidence > 1) throw new Error("invalid_confidence");
    if (input.action !== "hold" && input.evidenceIds.length === 0) throw new Error("evidence_required");
    const createdAt = Date.now();
    const decisionHash = await stableHash({ ...input, createdAt });
    const record = { ...input, createdAt, decisionHash };
    this.decisions.set(input.decisionId, record);
    return structuredClone(record);
  }

  attachOutcome(outcome: DecisionOutcome): DecisionRecord {
    const record = this.decisions.get(outcome.decisionId);
    if (!record) throw new Error("decision_not_found");
    if (record.outcome) throw new Error("outcome_exists");
    record.outcome = structuredClone(outcome);
    return structuredClone(record);
  }

  effectiveness(agentId?: string): { decisions: number; wins: number; losses: number; winRate: number; pnl: number } {
    const rows = [...this.decisions.values()].filter((x) => agentId == null || x.agentId === agentId).filter((x) => x.outcome);
    const wins = rows.filter((x) => (x.outcome?.realizedPnl ?? 0) > 0).length;
    const losses = rows.filter((x) => (x.outcome?.realizedPnl ?? 0) < 0).length;
    const pnl = rows.reduce((s, x) => s + (x.outcome?.realizedPnl ?? 0), 0);
    return { decisions: rows.length, wins, losses, winRate: rows.length ? wins / rows.length : 0, pnl };
  }

  list(): DecisionRecord[] { return [...this.decisions.values()].sort((a, b) => a.createdAt - b.createdAt).map((value) => structuredClone(value)); }
}

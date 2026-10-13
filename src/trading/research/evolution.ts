import type { StrategyGenome } from "../strategy-genome.ts";
import { mutateStrategy } from "../strategy-genome.ts";

export interface StrategyCandidate {
  strategy: StrategyGenome;
  score: number;
  status: "candidate" | "challenger" | "champion" | "retired";
  createdAt: number;
  parentId?: string;
}

export class StrategyEvolutionLab {
  private readonly candidates = new Map<string, StrategyCandidate>();
  private championId: string | null = null;

  add(strategy: StrategyGenome, score: number, status: StrategyCandidate["status"] = "candidate"): StrategyCandidate {
    const candidate: StrategyCandidate = { strategy, score, status, createdAt: Date.now(), parentId: strategy.createdFrom };
    this.candidates.set(strategy.id, candidate);
    return candidate;
  }

  mutate(baseId: string, seed: number): StrategyCandidate {
    const base = this.candidates.get(baseId);
    if (!base) throw new Error(`unknown_strategy:${baseId}`);
    const next = mutateStrategy(base.strategy, seed);
    return this.add(next, Number.NEGATIVE_INFINITY, "challenger");
  }

  promote(id: string): StrategyCandidate {
    const candidate = this.candidates.get(id);
    if (!candidate) throw new Error(`unknown_strategy:${id}`);
    if (this.championId && this.candidates.has(this.championId)) this.candidates.get(this.championId)!.status = "retired";
    candidate.status = "champion";
    this.championId = id;
    return candidate;
  }

  rank(): StrategyCandidate[] {
    return [...this.candidates.values()].sort((a, b) => b.score - a.score || a.createdAt - b.createdAt);
  }

  champion(): StrategyCandidate | null { return this.championId ? this.candidates.get(this.championId) ?? null : null; }
}

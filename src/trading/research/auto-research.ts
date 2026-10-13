import { stableHash } from "../runtime/task-results.ts";

export interface ResearchHypothesis {
  hypothesisId: string;
  strategyId: string;
  thesis: string;
  featureSet: string[];
  parameters: Record<string, number>;
  parentHypothesisId?: string;
  createdAt: number;
}

export interface ResearchFactor {
  factorId: string;
  name: string;
  expression: string;
  rationale: string;
  direction: "higher_is_better" | "lower_is_better" | "contextual";
  provenance: string[];
  discoveredAt: number;
}

export interface ResearchExperimentArtifact {
  artifactId: string;
  hypothesis: ResearchHypothesis;
  factors: ResearchFactor[];
  seed: number;
  trainWindow: { start: number; end: number };
  testWindow: { start: number; end: number };
  sensitivity: Record<string, number>;
  bootstrap: { samples: number; lower: number; median: number; upper: number };
  multipleTestingPenalty: number;
  leakageFree: boolean;
  artifactHash: string;
  createdAt: number;
}

export interface PromotionEvidence {
  eligible: boolean;
  reasons: string[];
  score: number;
}

export class AutoResearchFactory {
  private readonly hypotheses = new Map<string, ResearchHypothesis>();
  private readonly factors = new Map<string, ResearchFactor>();
  private readonly artifacts = new Map<string, ResearchExperimentArtifact>();

  addHypothesis(input: Omit<ResearchHypothesis, "createdAt">): ResearchHypothesis {
    const hypothesis = { ...input, createdAt: Date.now() };
    if (this.hypotheses.has(hypothesis.hypothesisId)) throw new Error("hypothesis_exists");
    this.hypotheses.set(hypothesis.hypothesisId, hypothesis);
    return structuredClone(hypothesis);
  }

  discoverFactor(input: Omit<ResearchFactor, "discoveredAt">): ResearchFactor {
    const factor = { ...input, discoveredAt: Date.now() };
    if (this.factors.has(factor.factorId)) throw new Error("factor_exists");
    if (!factor.expression.trim()) throw new Error("factor_expression_required");
    this.factors.set(factor.factorId, factor);
    return structuredClone(factor);
  }

  buildArtifact(input: Omit<ResearchExperimentArtifact, "artifactHash" | "createdAt">): Promise<ResearchExperimentArtifact> {
    const payload = {
      ...input,
      windowsChronological: input.trainWindow.end <= input.testWindow.start,
      leakageFree: input.leakageFree,
    };
    if (!payload.windowsChronological) throw new Error("research_window_leakage");
    if (!payload.leakageFree) throw new Error("leakage_guard_failed");
    const artifactId = input.artifactId;
    if (this.artifacts.has(artifactId)) throw new Error("artifact_exists");
    return stableHash(payload).then((artifactHash) => {
      const artifact = { ...input, artifactHash, createdAt: Date.now() };
      this.artifacts.set(artifactId, artifact);
      return structuredClone(artifact);
    });
  }

  evaluatePromotion(artifact: ResearchExperimentArtifact): PromotionEvidence {
    const reasons: string[] = [];
    const penalty = Math.max(0, Math.min(1, artifact.multipleTestingPenalty));
    if (!artifact.leakageFree) reasons.push("leakage_detected");
    if (artifact.bootstrap.lower <= 0) reasons.push("bootstrap_lower_bound_non_positive");
    if (penalty < 0.5) reasons.push("multiple_testing_penalty_below_threshold");
    const sensitivityValues = Object.values(artifact.sensitivity);
    const robustSensitivity = sensitivityValues.length === 0 || sensitivityValues.every((v) => v >= 0);
    if (!robustSensitivity) reasons.push("negative_sensitivity");
    const score = Math.max(0, artifact.bootstrap.median * penalty * (robustSensitivity ? 1 : 0.5));
    return { eligible: reasons.length === 0, reasons, score };
  }

  listHypotheses(): ResearchHypothesis[] { return [...this.hypotheses.values()].map((x) => structuredClone(x)); }
  listFactors(): ResearchFactor[] { return [...this.factors.values()].map((x) => structuredClone(x)); }
  listArtifacts(): ResearchExperimentArtifact[] { return [...this.artifacts.values()].map((x) => structuredClone(x)); }
}

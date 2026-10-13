import { createHash } from "node:crypto";

export type QuantCapabilityKind =
  | "data-pipeline"
  | "factor-research"
  | "model-training"
  | "model-evaluation"
  | "portfolio-optimization"
  | "backtest-acceleration"
  | "concept-drift-research"
  | "experiment-governance";

export interface QuantCapabilityRequirement {
  kind: QuantCapabilityKind;
  name: string;
  description: string;
  evidenceRequired: string[];
  latencyClass: "research" | "tactical" | "fast-path-excluded";
  liveExecutionAllowed: false;
}

export interface QuantCapabilityContract {
  benchmarkIds: string[];
  contractVersion: string;
  requirements: QuantCapabilityRequirement[];
  requiredSafety: {
    pointInTime: true;
    reproducibility: true;
    provenance: true;
    independentValidation: true;
    liveDisabled: true;
  };
  contractHash: string;
}

function stable(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${stable(object[key])}`).join(",")}}`;
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

const REQUIREMENTS: QuantCapabilityRequirement[] = [
  {
    kind: "data-pipeline",
    name: "point-in-time-data-pipeline",
    description: "Normalize versioned market/research data with explicit as-of boundaries.",
    evidenceRequired: ["source-provenance", "event-publication-availability-timestamps", "missing-data-policy"],
    latencyClass: "research",
    liveExecutionAllowed: false,
  },
  {
    kind: "factor-research",
    name: "factor-and-feature-research",
    description: "Run reproducible factor/feature discovery without future-information leakage.",
    evidenceRequired: ["factor-lineage", "lookahead-check", "feature-hash"],
    latencyClass: "research",
    liveExecutionAllowed: false,
  },
  {
    kind: "model-training",
    name: "model-training-and-selection",
    description: "Train candidate models with bounded datasets, parameters and deterministic experiment lineage.",
    evidenceRequired: ["training-window", "parameter-manifest", "dataset-hash", "model-artifact-hash"],
    latencyClass: "research",
    liveExecutionAllowed: false,
  },
  {
    kind: "model-evaluation",
    name: "out-of-sample-model-evaluation",
    description: "Evaluate candidates on held-out and walk-forward data before promotion.",
    evidenceRequired: ["oos-window", "walk-forward-manifest", "robustness-metrics", "independent-review"],
    latencyClass: "research",
    liveExecutionAllowed: false,
  },
  {
    kind: "portfolio-optimization",
    name: "portfolio-and-risk-optimization",
    description: "Generate bounded allocations subject to independent portfolio and risk constraints.",
    evidenceRequired: ["constraint-manifest", "risk-check", "correlation-context", "allocation-hash"],
    latencyClass: "tactical",
    liveExecutionAllowed: false,
  },
  {
    kind: "backtest-acceleration",
    name: "research-backtest-acceleration",
    description: "Accelerate parameter/configuration evaluation while preserving deterministic provenance.",
    evidenceRequired: ["replay-manifest", "fees-slippage-model", "result-hash"],
    latencyClass: "research",
    liveExecutionAllowed: false,
  },
  {
    kind: "concept-drift-research",
    name: "concept-drift-and-adaptation-research",
    description: "Detect regime/concept changes and evaluate strategy adaptation as research evidence.",
    evidenceRequired: ["regime-definition", "drift-metric", "adaptation-lineage", "promotion-gate"],
    latencyClass: "research",
    liveExecutionAllowed: false,
  },
  {
    kind: "experiment-governance",
    name: "quant-experiment-governance",
    description: "Bind hypotheses, datasets, parameters, models, evaluations and decisions into immutable lineage.",
    evidenceRequired: ["experiment-id", "input-hashes", "stage-history", "decision-hash"],
    latencyClass: "research",
    liveExecutionAllowed: false,
  },
];

export function buildQuantCapabilityContract(
  benchmarkIds: string[] = ["qlib", "rd-agent-q"],
): QuantCapabilityContract {
  const normalizedBenchmarks = [...new Set(benchmarkIds.map((value) => value.trim()).filter(Boolean))].sort();
  if (normalizedBenchmarks.length === 0) throw new Error("quant_benchmark_required");
  const base = {
    benchmarkIds: normalizedBenchmarks,
    contractVersion: "10.2.0",
    requirements: REQUIREMENTS.map((requirement) => ({ ...requirement, evidenceRequired: [...requirement.evidenceRequired] })),
    requiredSafety: {
      pointInTime: true as const,
      reproducibility: true as const,
      provenance: true as const,
      independentValidation: true as const,
      liveDisabled: true as const,
    },
  };
  return { ...base, contractHash: sha256(stable(base)) };
}

export function getQuantCapabilityRequirement(kind: QuantCapabilityKind): QuantCapabilityRequirement {
  const requirement = REQUIREMENTS.find((candidate) => candidate.kind === kind);
  if (!requirement) throw new Error(`unknown_quant_capability:${kind}`);
  return { ...requirement, evidenceRequired: [...requirement.evidenceRequired] };
}

export function validateQuantCapabilityContract(contract: QuantCapabilityContract): boolean {
  if (contract.contractVersion !== "10.2.0") return false;
  if (contract.requiredSafety.liveDisabled !== true) return false;
  if (contract.requiredSafety.pointInTime !== true) return false;
  if (contract.requiredSafety.provenance !== true) return false;
  if (contract.requiredSafety.reproducibility !== true) return false;
  if (contract.requiredSafety.independentValidation !== true) return false;
  if (contract.benchmarkIds.length === 0) return false;
  if (contract.requirements.length !== REQUIREMENTS.length) return false;
  const { contractHash: _, ...base } = contract;
  return sha256(stable(base)) === contract.contractHash;
}

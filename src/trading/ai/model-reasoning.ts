import type { TradingEvidencePacket } from "../evidence.ts";
import type { DebateStance } from "../debate.ts";
import type { TradingWorkerIdentity } from "../runtime/worker-registry.ts";
import { stableHash } from "../runtime/task-results.ts";

export interface ModelReasoningRequest {
  worker: TradingWorkerIdentity;
  taskType: "evidence-review" | "debate-turn" | "debate-critique";
  topic?: string;
  round?: number;
  evidence: TradingEvidencePacket[];
  allowedTools: string[];
  policyVersion: string;
}

export interface ModelReasoningResponse {
  summary: string;
  assumptions: string[];
  evidenceIds: string[];
  stance: DebateStance;
  confidence: number;
  critique: string;
}


export interface DebateCritiqueInput {
  worker: TradingWorkerIdentity;
  topic: string;
  evidence: TradingEvidencePacket[];
  round: number;
  priorTurnIds: string[];
  priorArguments: string[];
}

export interface ModelClient {
  complete(input: { system: string; user: string }): Promise<{ text: string; modelId: string; provider: string; tokens?: number }>;
}

function clamp(value: number): number { return Math.max(0, Math.min(1, value)); }

function compactEvidence(evidence: TradingEvidencePacket[]): string {
  return evidence.map((p) => JSON.stringify({
    evidenceId: p.evidenceId,
    subjectId: p.subjectId,
    type: p.evidenceType,
    claim: p.claim,
    confidence: p.confidence,
    source: p.source,
    eventTs: p.eventTs,
    publishedTs: p.publishedTs,
    quality: p.quality?.score ?? null,
    payload: p.payload,
  })).join("\n");
}

function parseModelJson(text: string): ModelReasoningResponse {
  const trimmed = text.trim().replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
  const parsed = JSON.parse(trimmed) as Partial<ModelReasoningResponse>;
  if (typeof parsed.summary !== "string" || !parsed.summary.trim()) throw new Error("model_reasoning_summary_required");
  if (!Array.isArray(parsed.assumptions) || !Array.isArray(parsed.evidenceIds)) throw new Error("model_reasoning_arrays_required");
  const stance = parsed.stance;
  if (stance !== "bull" && stance !== "bear" && stance !== "neutral" && stance !== "abstain") throw new Error("model_reasoning_stance_invalid");
  return {
    summary: parsed.summary.trim(),
    assumptions: parsed.assumptions.map(String).slice(0, 32),
    evidenceIds: parsed.evidenceIds.map(String),
    stance,
    confidence: clamp(Number(parsed.confidence ?? 0)),
    critique: typeof parsed.critique === "string" ? parsed.critique.trim() : "",
  };
}

export class HttpJsonModelClient implements ModelClient {
  private readonly input: { endpoint: string; apiKey?: string; modelId: string; provider?: string; fetchImpl?: typeof fetch; timeoutMs?: number };
  constructor(input: {
    endpoint: string;
    apiKey?: string;
    modelId: string;
    provider?: string;
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
  }) { this.input = input; }

  async complete(input: { system: string; user: string }) {
    const fetchImpl = this.input.fetchImpl ?? fetch;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Math.max(500, this.input.timeoutMs ?? 30_000));
    try {
      const response = await fetchImpl(this.input.endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(this.input.apiKey ? { authorization: `Bearer ${this.input.apiKey}` } : {}),
        },
        body: JSON.stringify({
          model: this.input.modelId,
          system: input.system,
          input: input.user,
          response_format: { type: "json_object" },
        }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`model_http_${response.status}`);
      const body = await response.json() as { output_text?: string; text?: string; output?: Array<{ content?: Array<{ text?: string }> }> };
      const text = body.output_text ?? body.text ?? body.output?.flatMap((x) => x.content ?? []).map((x) => x.text ?? "").join("") ?? "";
      if (!text.trim()) throw new Error("model_empty_output");
      return { text, modelId: this.input.modelId, provider: this.input.provider ?? "http-json-model" };
    } finally {
      clearTimeout(timeout);
    }
  }
}

export async function buildReasoningRequest(input: ModelReasoningRequest): Promise<{ request: ModelReasoningRequest; inputHash: string; system: string; user: string }> {
  const request = structuredClone(input);
  const system = [
    "You are a trading research worker inside Helix.",
    `Worker: ${input.worker.workerId} (${input.worker.family}; ${input.worker.specializationName}).`,
    `Capabilities: ${input.worker.capabilities.join(", ") || "none"}.`,
    `Allowed tools: ${input.allowedTools.join(", ") || "none"}. Never invent tool results.`,
    `Policy version: ${input.policyVersion}.`,
    "Use only the supplied evidence. Evidence is not automatically a trade instruction.",
    "Cite only evidenceIds that appear in the supplied evidence.",
    "Return strict JSON with summary, assumptions[], evidenceIds[], stance, confidence, critique.",
  ].join("\n");
  const user = JSON.stringify({
    taskType: input.taskType,
    topic: input.topic ?? null,
    round: input.round ?? null,
    evidence: compactEvidence(input.evidence),
  });
  return { request, inputHash: await stableHash({ system, user }), system, user };
}

export class ModelBackedWorkerReasoningProvider {
  private readonly input: { client: ModelClient; policyVersion?: string };
  constructor(input: { client: ModelClient; policyVersion?: string }) { this.input = input; }

  async reviewEvidence(input: { worker: TradingWorkerIdentity; packet: TradingEvidencePacket }) {
    const built = await buildReasoningRequest({
      worker: input.worker,
      taskType: "evidence-review",
      evidence: [input.packet],
      allowedTools: input.worker.capabilities,
      policyVersion: this.input.policyVersion ?? "worker-reasoning-v1",
    });
    const response = await this.input.client.complete({ system: built.system, user: built.user });
    const parsed = parseModelJson(response.text);
    const allowed = new Set([input.packet.evidenceId]);
    if (parsed.evidenceIds.some((id) => !allowed.has(id))) throw new Error("model_reasoning_unknown_evidence_id");
    return { ...parsed, modelId: response.modelId, provider: response.provider, inputHash: built.inputHash, tokens: response.tokens ?? 0 };
  }

  async debateTurn(input: { worker: TradingWorkerIdentity; topic: string; evidence: TradingEvidencePacket[]; round: number }) {
    const built = await buildReasoningRequest({
      worker: input.worker,
      taskType: "debate-turn",
      topic: input.topic,
      round: input.round,
      evidence: input.evidence,
      allowedTools: input.worker.capabilities,
      policyVersion: this.input.policyVersion ?? "worker-reasoning-v1",
    });
    const response = await this.input.client.complete({ system: built.system, user: built.user });
    const allowed = new Set(input.evidence.map((p) => p.evidenceId));
    const parsed = parseModelJson(response.text);
    if (parsed.evidenceIds.some((id) => !allowed.has(id))) throw new Error("model_reasoning_unknown_evidence_id");
    return { argument: parsed.summary, ...parsed, challengeOfTurnIds: [], modelId: response.modelId, provider: response.provider, inputHash: built.inputHash, tokens: response.tokens ?? 0 };
  }

  async critiqueDebateTurn(input: DebateCritiqueInput) {
    const built = await buildReasoningRequest({
      worker: input.worker,
      taskType: "debate-critique",
      topic: input.topic,
      round: input.round,
      evidence: input.evidence,
      allowedTools: input.worker.capabilities,
      policyVersion: this.input.policyVersion ?? "worker-reasoning-v1",
    });
    const response = await this.input.client.complete({
      system: built.system + "\nYour role is adversarial critique. Identify the strongest unsupported assumption and rebut it. Return JSON.",
      user: built.user + "\n" + JSON.stringify({ priorTurnIds: input.priorTurnIds, priorArguments: input.priorArguments }),
    });
    const parsed = parseModelJson(response.text);
    const allowedEvidence = new Set(input.evidence.map((p) => p.evidenceId));
    if (parsed.evidenceIds.some((id) => !allowedEvidence.has(id))) throw new Error("model_reasoning_unknown_evidence_id");
    return { argument: parsed.summary, ...parsed, challengeOfTurnIds: input.priorTurnIds.slice(0, 16), modelId: response.modelId, provider: response.provider, inputHash: built.inputHash, tokens: response.tokens ?? 0 };
  }
}

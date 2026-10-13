import type { TradingEvidencePacket, EvidenceStore } from "../evidence.ts";
import { DebateCoordinator, type DebateStance } from "../debate.ts";
import type { TradingTask } from "./task-queue.ts";
import type { TradingWorkerIdentity } from "./worker-registry.ts";
import type { WorkerExecutionContext, WorkerExecutionResult } from "./worker-supervisor.ts";
import { stableHash } from "./task-results.ts";
import { buildReasoningRecord, type WorkerReasoningTraceStore } from "./reasoning-store.ts";
import { ModelBackedWorkerReasoningProvider } from "../ai/model-reasoning.ts";
import { nativeBacktest, nativeMarketSnapshot, nativeRiskCheck, nativeTechnicalSignal, type Bar, type BookLevel, type Position, type RiskLimits, type Side } from "../../runtime/tools/trading.ts";
import type { GovernedNativeToolRuntime } from "../../runtime/tools/registry-bootstrap.ts";
import type { AgentTradeGateway } from "../execution/agent-trade-gateway.ts";

export type TradingWorkerTool =
  | "event.analyze"
  | "market.snapshot"
  | "technical.signal"
  | "risk.check"
  | "backtest"
  | "filings.lookup"
  | "news.lookup"
  | "onchain.lookup"
  | "positioning.lookup"
  | "debate.record"
  | "debate.critique"
  | "evidence.review"
  | "trade.execute";

const TOOL_BY_CAPABILITY: Record<string, TradingWorkerTool[]> = {
  "market-data": ["market.snapshot"],
  technical: ["technical.signal"],
  signal: ["technical.signal", "market.snapshot"],
  risk: ["risk.check"],
  backtest: ["backtest"],
  filings: ["filings.lookup"],
  news: ["news.lookup"],
  "entity-intelligence": ["onchain.lookup", "filings.lookup"],
  positioning: ["positioning.lookup"],
  strategy: ["backtest", "technical.signal"],
  trading: ["market.snapshot", "trade.execute"],
};

export interface WorkerToolCall {
  tool: TradingWorkerTool;
  allowed: boolean;
  inputHash: string;
  outputHash: string;
}

export interface WorkerReasoningTrace {
  workerId: string;
  taskId: string;
  modelId: string;
  policyVersion: string;
  taskType: string;
  summary: string;
  assumptions: string[];
  evidenceIds: string[];
  toolCalls: WorkerToolCall[];
  stance: DebateStance | null;
  confidence: number;
  critique?: string;
  provider?: string;
  inputHash?: string;
  tokens?: number;
}

export interface WorkerToolContext {
  worker: TradingWorkerIdentity;
  task: TradingTask;
  invoke<TInput, TOutput>(tool: TradingWorkerTool, input: TInput, handler: (input: TInput) => Promise<TOutput>): Promise<{ output: TOutput; trace: WorkerToolCall }>;
}

export interface WorkerReviewResult {
  summary: string;
  assumptions: string[];
  evidenceIds: string[];
  confidence: number;
  stance: DebateStance;
  critique: string;
  provider: string;
  modelId: string;
  inputHash: string;
  tokens?: number;
}

export interface WorkerDebateResult extends WorkerReviewResult {
  argument: string;
  challengeOfTurnIds: string[];
}

export interface WorkerReasoningProvider {
  reviewEvidence(input: { worker: TradingWorkerIdentity; packet: TradingEvidencePacket }): Promise<WorkerReviewResult>;
  debateTurn(input: { worker: TradingWorkerIdentity; topic: string; evidence: TradingEvidencePacket[]; round: number }): Promise<WorkerDebateResult>;
  critiqueDebateTurn(input: { worker: TradingWorkerIdentity; topic: string; evidence: TradingEvidencePacket[]; round: number; priorTurnIds: string[]; priorArguments: string[] }): Promise<WorkerDebateResult>;
}

function unwrapPayload(task: TradingTask): Record<string, unknown> {
  const raw = (task.payload ?? {}) as Record<string, unknown>;
  return raw && typeof raw === "object" && "data" in raw && "_routing" in raw ? (raw.data as Record<string, unknown>) ?? {} : raw;
}

function allowedTools(worker: TradingWorkerIdentity): Set<TradingWorkerTool> {
  const tools = new Set<TradingWorkerTool>(["evidence.review", "debate.record", "debate.critique"]);
  for (const capability of worker.capabilities) for (const tool of TOOL_BY_CAPABILITY[capability] ?? []) tools.add(tool);
  return tools;
}

function assertWorkerCanUse(worker: TradingWorkerIdentity, tool: TradingWorkerTool): void {
  if (!allowedTools(worker).has(tool)) throw new Error(`worker_tool_not_allowed:${tool}`);
}

export class DeterministicWorkerReasoningProvider implements WorkerReasoningProvider {
  async reviewEvidence(input: { worker: TradingWorkerIdentity; packet: TradingEvidencePacket }) {
    const packetConfidence = Math.max(0, Math.min(1, input.packet.confidence));
    const relevant = input.packet.evidenceType.toLowerCase().includes(input.worker.family.toLowerCase()) || input.worker.capabilities.some((c) => input.packet.evidenceType.toLowerCase().includes(c.replace(/-/g, " ")));
    const confidence = Math.max(0, Math.min(1, packetConfidence * (relevant ? 1 : 0.75)));
    const stance: DebateStance = confidence >= 0.75 ? "bull" : confidence >= 0.5 ? "neutral" : "abstain";
    return {
      summary: relevant ? `Evidence is relevant to ${input.worker.specializationName}; treat it as a supportive input, not proof.` : `Evidence relevance to ${input.worker.specializationName} is limited; independent corroboration is required.`,
      assumptions: ["Evidence is not automatically a trade instruction.", "Independent corroboration remains required."],
      evidenceIds: [input.packet.evidenceId],
      critique: "Deterministic fallback: no learned model inference was used.",
      confidence,
      stance,
      provider: "deterministic",
      modelId: "deterministic-worker-reasoning-v1",
      inputHash: await stableHash({ worker: input.worker.workerId, evidenceId: input.packet.evidenceId, confidence: input.packet.confidence }),
      tokens: 0,
    };
  }

  async debateTurn(input: { worker: TradingWorkerIdentity; topic: string; evidence: TradingEvidencePacket[]; round: number }) {
    const sorted = [...input.evidence].sort((a, b) => b.confidence - a.confidence || a.evidenceId.localeCompare(b.evidenceId));
    const strongest = sorted[0];
    const average = sorted.length ? sorted.reduce((sum, packet) => sum + packet.confidence, 0) / sorted.length : 0;
    const stance: DebateStance = average >= 0.78 ? "bull" : average >= 0.5 ? "neutral" : "abstain";
    const argument = strongest
      ? `Round ${input.round}: ${input.worker.specializationName} reviewed ${sorted.length} evidence item(s). Strongest evidence (${strongest.evidenceId}) supports: ${strongest.claim}. This is contextual evidence only; independent challenge remains required for “${input.topic}”.`
      : `Round ${input.round}: ${input.worker.specializationName} has insufficient persisted evidence to support a directional conclusion on “${input.topic}”.`;
    return {
      argument,
      summary: argument,
      assumptions: ["Evidence is not automatically a trade instruction."],
      critique: "Deterministic fallback: independent model critique unavailable.",
      confidence: sorted.length ? Math.min(0.95, Math.max(0.25, average)) : 0.2,
      stance,
      evidenceIds: sorted.map((packet) => packet.evidenceId),
      challengeOfTurnIds: [],
      provider: "deterministic",
      modelId: "deterministic-worker-reasoning-v1",
      inputHash: await stableHash({ worker: input.worker.workerId, topic: input.topic, round: input.round, evidenceIds: sorted.map((p)=>p.evidenceId) }),
      tokens: 0,
    };
  }

  async critiqueDebateTurn(input: { worker: TradingWorkerIdentity; topic: string; evidence: TradingEvidencePacket[]; round: number; priorTurnIds: string[]; priorArguments: string[] }) {
    const result = await this.debateTurn({ worker: input.worker, topic: input.topic, evidence: input.evidence, round: input.round });
    return { ...result, summary: `Adversarial critique: ${result.summary}`, argument: `Adversarial critique: ${result.argument}`, challengeOfTurnIds: input.priorTurnIds.slice(0, 16), critique: `Challenged ${input.priorTurnIds.length} prior turn(s); deterministic fallback used.` };
  }
}

function buildDefaultReasoningProvider(): WorkerReasoningProvider {
  const endpoint = typeof process !== "undefined" ? process.env.HELIX_MODEL_ENDPOINT?.trim() : undefined;
  const modelId = typeof process !== "undefined" ? process.env.HELIX_MODEL_ID?.trim() : undefined;
  const apiKey = typeof process !== "undefined" ? process.env.HELIX_MODEL_API_KEY?.trim() : undefined;
  if (endpoint && modelId) {
    return new ModelBackedWorkerReasoningProvider({
      client: new (class {
        async complete(input: {system:string;user:string}) {
          const response = await fetch(endpoint, {
            method: "POST",
            headers: { "content-type": "application/json", ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}) },
            body: JSON.stringify({ model: modelId, system: input.system, input: input.user, response_format: { type: "json_object" } }),
          });
          if (!response.ok) throw new Error(`model_http_${response.status}`);
          const body = await response.json() as { output_text?:string; text?:string; output?:Array<{content?:Array<{text?:string}>}> };
          const text = body.output_text ?? body.text ?? body.output?.flatMap((x)=>x.content??[]).map((x)=>x.text??"").join("") ?? "";
          if (!text.trim()) throw new Error("model_empty_output");
          return { text, modelId, provider: "env-http-json-model" };
        }
      })(),
    });
  }
  return new DeterministicWorkerReasoningProvider();
}

export class TradingWorkerTaskEngine {
  private readonly evidence: EvidenceStore;
  private readonly debates: DebateCoordinator;
  private readonly reasoning: WorkerReasoningProvider;
  private readonly reasoningStore: WorkerReasoningTraceStore | null;
  private readonly tradeGateway: AgentTradeGateway | null;
  private readonly nativeRuntime: GovernedNativeToolRuntime | null;

  constructor(input: { evidence: EvidenceStore; debates: DebateCoordinator; reasoning?: WorkerReasoningProvider; reasoningStore?: WorkerReasoningTraceStore; tradeGateway?: AgentTradeGateway; nativeRuntime?: GovernedNativeToolRuntime }) {
    this.evidence = input.evidence;
    this.debates = input.debates;
    this.reasoningStore = input.reasoningStore ?? null;
    this.reasoning = input.reasoning ?? buildDefaultReasoningProvider();
    this.tradeGateway = input.tradeGateway ?? null;
    this.nativeRuntime = input.nativeRuntime ?? null;
  }

  async execute(context: WorkerExecutionContext): Promise<WorkerExecutionResult> {
    const { task, worker } = context;
    const governedNative = <T>(name: string, input: unknown, fallback: () => T): T => {
      if (this.nativeRuntime) return this.nativeRuntime.execute(name, input) as T;
      return fallback();
    };
    const payload = unwrapPayload(task);
    const toolCalls: WorkerToolCall[] = [];
    const invoke = async <TInput, TOutput>(tool: TradingWorkerTool, input: TInput, handler: (input: TInput) => Promise<TOutput>): Promise<TOutput> => {
      assertWorkerCanUse(worker, tool);
      const output = await handler(input);
      toolCalls.push({ tool, allowed: true, inputHash: await stableHash(input), outputHash: await stableHash(output) });
      return output;
    };

    if (task.type === "event.analyze") {
      const event = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
      const type = String(event.type ?? "");
      const eventPayload = event.payload && typeof event.payload === "object" ? event.payload as Record<string, unknown> : {};
      if (!type || !String(event.id ?? "").trim()) {
        return { ok: false, output: { error: "event_payload_invalid", workerId: worker.workerId, taskId: task.id }, error: "event_payload_invalid", executor: "worker-engine-v1" };
      }
      const capability = type.startsWith("risk.") ? "risk"
        : type.startsWith("news.") ? "news"
        : type.startsWith("macro.") ? "macro"
        : type.startsWith("strategy.") ? "strategy"
        : type.startsWith("market.") ? "market-data"
        : type.startsWith("paper.") ? "performance"
        : "research";
      const summary = `${worker.specializationName} activated for ${type} event ${String(event.id)}.`;
      const output = {
        workerId: worker.workerId,
        taskId: task.id,
        kind: "event-analysis",
        eventType: type,
        eventId: String(event.id),
        source: String(event.source ?? "unknown"),
        eventTs: Number(event.ts ?? 0),
        requiredCapability: capability,
        specialization: worker.specializationName,
        family: worker.family,
        focus: worker.focus,
        payloadKeys: Object.keys(eventPayload).sort().slice(0, 64),
        nextAction: type === "risk.alert" ? "route_to_risk_review"
          : type === "paper.order.filled" ? "record_post_trade_learning"
          : type === "strategy.signal" || type === "strategy.review" ? "route_to_strategy_review"
          : type.startsWith("news.") ? "route_to_news_review"
          : type.startsWith("macro.") ? "route_to_macro_review"
          : type === "market.regime.changed" ? "route_to_regime_review"
          : "retain_for_specialist_research",
        reasoning: {
          summary,
          assumptions: ["This task analyzes and routes an event; it does not authorize live execution.", "Independent risk and paper-session gates remain authoritative."],
          evidenceIds: Array.isArray(eventPayload.evidenceIds) ? eventPayload.evidenceIds.map(String).filter(Boolean) : [],
          stance: "neutral",
          confidence: 0.5,
          provider: "deterministic-event-router",
          modelId: "event-worker-v1",
        },
        toolCalls: [],
      };
      return { ok: true, output, executor: "worker-engine-v1", tokens: 0 };
    }

    if (task.type === "market.snapshot") {
      const input = {
        symbol: String(payload.symbol ?? ""),
        price: Number(payload.price ?? 0),
        bids: (Array.isArray(payload.bids) ? payload.bids : []) as BookLevel[],
        asks: (Array.isArray(payload.asks) ? payload.asks : []) as BookLevel[],
        ts: Number(payload.ts ?? Date.now()),
        receivedAt: Number(payload.receivedAt ?? Date.now()),
        source: String(payload.source ?? "worker"),
      };
      const snapshot = await invoke("market.snapshot", input, async (value) => governedNative("native.market.snapshot", value, () => nativeMarketSnapshot(value)));
      return { ok: true, output: { workerId: worker.workerId, taskId: task.id, kind: "market-snapshot", reasoning: { summary: "Deterministic market snapshot generated from supplied market data.", assumptions: ["Input data was provided by an upstream trusted source or replay."], evidenceIds: [] }, toolCalls, snapshot }, executor: "worker-engine-v1" };
    }

    if (task.type === "technical.signal") {
      const bars = (Array.isArray(payload.bars) ? payload.bars : []) as Bar[];
      const signalInput = { bars, fast: Number(payload.fast ?? 10), slow: Number(payload.slow ?? 30) };
      const signal = await invoke("technical.signal", { bars: bars.length, fast: signalInput.fast, slow: signalInput.slow }, async () => governedNative("native.technical.signal", signalInput, () => nativeTechnicalSignal(bars, signalInput.fast, signalInput.slow)));
      return { ok: true, output: { workerId: worker.workerId, taskId: task.id, kind: "technical-signal", reasoning: { summary: "Deterministic technical signal generated from the supplied bar window.", assumptions: ["Bars are point-in-time valid and ordered."], evidenceIds: [] }, toolCalls, signal }, executor: "worker-engine-v1" };
    }

    if (task.type === "trade.execute") {
      if (!this.tradeGateway) return { ok: false, output: { error: "trade_gateway_not_configured" }, error: "trade_gateway_not_configured", executor: "worker-engine-v1" };
      const side = String(payload.side ?? "buy");
      const riskApproved = payload.riskApproved === true;
      const ownerApproved = payload.ownerApproved === true;
      const paperSessionId = String(payload.paperSessionId ?? "");
      const approved = riskApproved && ownerApproved && Boolean(paperSessionId.trim());
      const input = {
        workerId: worker.workerId,
        taskId: task.id,
        approved,
        riskApproved,
        ownerApproved,
        paperSessionId,
        clientOrderId: String(payload.clientOrderId ?? `${task.id}:${worker.workerId}`),
        symbol: String(payload.symbol ?? ""),
        side: side === "sell" ? "sell" : "buy",
        qty: payload.qty == null ? undefined : Number(payload.qty),
        notional: payload.notional == null ? undefined : Number(payload.notional),
        type: payload.type === "limit" ? "limit" : "market",
        limitPrice: payload.limitPrice == null ? undefined : Number(payload.limitPrice),
        timeInForce: payload.timeInForce == null ? undefined : String(payload.timeInForce),
        reduceOnly: payload.reduceOnly == null ? undefined : Boolean(payload.reduceOnly),
        evidenceIds: Array.isArray(payload.evidenceIds) ? payload.evidenceIds.map(String) : [],
        strategyId: payload.strategyId == null ? undefined : String(payload.strategyId),
      } as const;
      const result = await invoke("trade.execute", input, async (value) => this.tradeGateway!.place(value));
      return { ok: result.accepted, output: { workerId: worker.workerId, taskId: task.id, kind: "trade-execute", result, toolCalls, reasoning: { summary: result.accepted ? "Agent trade intent passed the explicit approval gate and was sent to the configured paper broker." : `Agent trade intent blocked: ${result.reason ?? "unknown"}.`, assumptions: ["Deterministic risk/readiness gates must approve before trade.execute is accepted."], evidenceIds: input.evidenceIds } }, error: result.accepted ? undefined : result.reason, executor: "worker-engine-v1" };
    }

    if (task.type === "risk.check") {
      const side = String(payload.side ?? "buy") as Side;
      const checkInput = {
        side, qty: Number(payload.qty ?? 0), price: Number(payload.price ?? 0), position: (payload.position ?? null) as Position | null,
        limits: payload.limits as RiskLimits, dailyPnl: Number(payload.dailyPnl ?? 0), equity: Number(payload.equity ?? 0),
        existingGrossExposureNotional: Number.isFinite(Number(payload.existingGrossExposureNotional)) ? Number(payload.existingGrossExposureNotional) : undefined,
        peakEquity: Number.isFinite(Number(payload.peakEquity)) ? Number(payload.peakEquity) : undefined,
      };
      const checked = await invoke("risk.check", checkInput, async (value) => governedNative("native.risk.check", value, () => nativeRiskCheck(value)));
      return { ok: true, output: { workerId: worker.workerId, taskId: task.id, kind: "risk-check", reasoning: { summary: "Independent deterministic risk check executed before any order decision.", assumptions: ["Risk limits are authoritative policy inputs."], evidenceIds: [] }, toolCalls, risk: checked }, executor: "worker-engine-v1" };
    }

    if (task.type === "backtest") {
      const bars = (Array.isArray(payload.bars) ? payload.bars : []) as Bar[];
      const strategy = (Array.isArray(payload.signals) ? payload.signals : []).map(String);
      const signalFn = (_window: Bar[], index: number) => (strategy[index] === "short" ? "short" : strategy[index] === "long" ? "long" : "flat") as "long" | "short" | "flat";
      const backtestInput = { bars, signalProfile: strategy.some((x) => x === "short") ? "mean-reversion" : "trend", feeBps: Number(payload.feeBps ?? 5), slippageBps: Number(payload.slippageBps ?? 2) };
      const result = await invoke("backtest", { bars: bars.length, feeBps: backtestInput.feeBps, slippageBps: backtestInput.slippageBps }, async () => governedNative("native.backtest", backtestInput, () => nativeBacktest(bars, signalFn, backtestInput.feeBps, backtestInput.slippageBps)));
      return { ok: true, output: { workerId: worker.workerId, taskId: task.id, kind: "backtest", reasoning: { summary: "Deterministic replay/backtest tool executed over the supplied point-in-time bar set.", assumptions: ["Signal sequence is supplied without future information."], evidenceIds: [] }, toolCalls, result }, executor: "worker-engine-v1" };
    }

    if (task.type === "evidence.review") {
      const requestedIds = Array.isArray(payload.evidenceIds) ? payload.evidenceIds.map(String).filter(Boolean) : [];
      const singlePacket = payload.evidence as TradingEvidencePacket | undefined;
      const packets = requestedIds.length
        ? await Promise.all(requestedIds.map(async (id) => this.evidence.get(id)))
        : singlePacket ? [singlePacket] : [];
      const resolved = packets.filter((packet): packet is TradingEvidencePacket => Boolean(packet));
      if (!resolved.length) return { ok: false, output: { error: "evidence_packet_required" }, error: "evidence_packet_required", executor: "worker-engine-v1" };
      if (requestedIds.length > 0 && (requestedIds.length !== resolved.length || new Set(resolved.map((p) => p.evidenceId)).size !== new Set(requestedIds).size)) {
        return { ok: false, output: { error: "evidence_ids_unresolved" }, error: "evidence_ids_unresolved", executor: "worker-engine-v1" };
      }
      const reviews = [];
      for (const packet of resolved) {
        const review = await invoke("evidence.review", { evidenceId: packet.evidenceId }, async () => this.reasoning.reviewEvidence({ worker, packet }));
        reviews.push(review);
        if (this.reasoningStore) {
          const record = await buildReasoningRecord({
            taskId: `${task.id}:${packet.evidenceId}`, workerId: worker.workerId, taskType: task.type,
            provider: String((review as { provider?: string }).provider ?? "unknown"),
            modelId: String((review as { modelId?: string }).modelId ?? "unknown"),
            policyVersion: String((review as { policyVersion?: string }).policyVersion ?? "worker-reasoning-v1"),
            inputHash: String((review as { inputHash?: string }).inputHash ?? await stableHash(packet)),
            trace: { summary: review.summary, assumptions: review.assumptions ?? [], evidenceIds: review.evidenceIds ?? [packet.evidenceId], stance: review.stance, confidence: review.confidence, critique: review.critique ?? "" },
          });
          await this.reasoningStore.record(record);
        }
      }
      const evidenceIds = reviews.flatMap((review) => review.evidenceIds).filter((id, index, ids) => ids.indexOf(id) === index);
      const approved = reviews.length === resolved.length
        && reviews.every((review) => review.confidence >= 0.5 && review.stance !== "abstain")
        && evidenceIds.length === resolved.length
        && resolved.every((packet) => evidenceIds.includes(packet.evidenceId));
      const summary = reviews.map((review) => review.summary).join(" ");
      const output = {
        workerId: worker.workerId, taskId: task.id, kind: "evidence-review", approved,
        reasoning: { summary, assumptions: reviews.flatMap((review) => review.assumptions ?? []), evidenceIds, critique: reviews.map((review) => review.critique ?? "").filter(Boolean).join(" "), provider: reviews.map((review) => review.provider).join(","), modelId: reviews.map((review) => review.modelId).join(","), inputHash: await stableHash({ taskId: task.id, evidenceIds }) },
        stance: reviews.length === 1 ? reviews[0]!.stance : "neutral",
        confidence: reviews.length ? Math.min(...reviews.map((review) => review.confidence)) : 0,
        toolCalls,
      } satisfies Record<string, unknown>;
      return { ok: true, output, executor: "worker-engine-v1", tokens: reviews.reduce((sum, review) => sum + (review.tokens ?? 0), 0) };
    }

    if (task.type === "debate.critique") {
      const sessionId = String(payload.sessionId ?? "");
      const round = Number(payload.round ?? 0);
      const topic = String(payload.topic ?? "");
      if (!sessionId || !round || !topic) return { ok: false, output: { error: "debate_payload_invalid" }, error: "debate_payload_invalid", executor: "worker-engine-v1" };
      const requestedWorkerId = String(payload.workerId ?? worker.workerId);
      if (requestedWorkerId !== worker.workerId) return { ok: false, output: { error: "debate_worker_mismatch" }, error: "debate_worker_mismatch", executor: "worker-engine-v1" };
      const evidenceIds = Array.isArray(payload.evidenceIds) ? payload.evidenceIds.map(String) : [];
      const priorTurnIds = Array.isArray(payload.priorTurnIds) ? payload.priorTurnIds.map(String) : [];
      const priorArguments = Array.isArray(payload.priorArguments) ? payload.priorArguments.map(String) : [];
      const evidence: TradingEvidencePacket[] = [];
      for (const evidenceId of evidenceIds) { const packet = await this.evidence.get(evidenceId); if (packet) evidence.push(packet); }
      const critique = await invoke("debate.critique", { sessionId, round, workerId: worker.workerId, evidenceIds, priorTurnIds }, async () => this.reasoning.critiqueDebateTurn({ worker, topic, evidence, round, priorTurnIds, priorArguments }));
      if (this.reasoningStore) {
        const record = await buildReasoningRecord({ taskId: task.id, workerId: worker.workerId, taskType: task.type, provider: String(critique.provider ?? "unknown"), modelId: String(critique.modelId ?? "unknown"), policyVersion: "worker-reasoning-v1", inputHash: String(critique.inputHash ?? await stableHash({ topic, round, evidenceIds, priorTurnIds })), trace: { summary: critique.argument, assumptions: critique.assumptions ?? [], evidenceIds: critique.evidenceIds, stance: critique.stance, confidence: critique.confidence, critique: critique.critique ?? "", challengeOfTurnIds: critique.challengeOfTurnIds ?? [] } });
        await this.reasoningStore.record(record);
      }
      const turnId = `critique:${sessionId}:${round}:${worker.workerId}:${task.id}`;
      await this.debates.recordTurn({ turnId, sessionId, round, workerId: worker.workerId, turnType: "critique", stance: critique.stance, argument: critique.argument, evidenceIds: critique.evidenceIds, confidence: critique.confidence, challengeOfTurnIds: critique.challengeOfTurnIds ?? [] });
      return { ok: true, output: { workerId: worker.workerId, taskId: task.id, kind: "debate-critique", reasoning: { summary: critique.argument, evidenceIds: critique.evidenceIds, critique: critique.critique ?? "", provider: critique.provider, modelId: critique.modelId, inputHash: critique.inputHash }, stance: critique.stance, confidence: critique.confidence, challengeOfTurnIds: critique.challengeOfTurnIds ?? [], toolCalls }, executor: "worker-engine-v1", tokens: 0 };
    }

    if (task.type === "debate.turn") {
      const sessionId = String(payload.sessionId ?? "");
      const round = Number(payload.round ?? 0);
      const topic = String(payload.topic ?? "");
      const workerId = String(payload.workerId ?? worker.workerId);
      if (!sessionId || !round || !topic) return { ok: false, output: { error: "debate_payload_invalid" }, error: "debate_payload_invalid", executor: "worker-engine-v1" };
      if (workerId !== worker.workerId) return { ok: false, output: { error: "debate_worker_mismatch" }, error: "debate_worker_mismatch", executor: "worker-engine-v1" };
      const evidenceIds = Array.isArray(payload.evidenceIds) ? payload.evidenceIds.map(String) : [];
      const evidence: TradingEvidencePacket[] = [];
      for (const evidenceId of evidenceIds) {
        const packet = await this.evidence.get(evidenceId);
        if (packet) evidence.push(packet);
      }
      const turn = await invoke("debate.record", { sessionId, round, workerId, evidenceIds }, async () => this.reasoning.debateTurn({ worker, topic, evidence, round }));
      if (this.reasoningStore) {
        const record = await buildReasoningRecord({
          taskId: task.id, workerId: worker.workerId, taskType: task.type,
          provider: String((turn as { provider?: string }).provider ?? "unknown"),
          modelId: String((turn as { modelId?: string }).modelId ?? "unknown"),
          policyVersion: "worker-reasoning-v1",
          inputHash: String((turn as { inputHash?: string }).inputHash ?? await stableHash({ topic, round, evidenceIds })),
          trace: { summary: turn.argument, assumptions: turn.assumptions ?? [], evidenceIds: turn.evidenceIds, stance: turn.stance, confidence: turn.confidence, critique: turn.critique ?? "", challengeOfTurnIds: turn.challengeOfTurnIds ?? [] },
        });
        await this.reasoningStore.record(record);
      }
      const turnId = `turn:${sessionId}:${round}:${workerId}`;
      await this.debates.recordTurn({
        turnId,
        sessionId,
        round,
        workerId,
        stance: turn.stance,
        argument: turn.argument,
        evidenceIds: turn.evidenceIds,
        confidence: turn.confidence,
        challengeOfTurnIds: turn.challengeOfTurnIds,
      });
      const output = {
        workerId,
        taskId: task.id,
        kind: "debate-turn",
        reasoning: { summary: turn.argument, assumptions: turn.assumptions ?? [], evidenceIds: turn.evidenceIds, critique: turn.critique ?? "", provider: (turn as {provider?:string}).provider ?? "unknown", modelId: (turn as {modelId?:string}).modelId ?? "unknown", inputHash: (turn as {inputHash?:string}).inputHash ?? "" },
        stance: turn.stance,
        confidence: turn.confidence,
        toolCalls,
      } satisfies Record<string, unknown>;
      return { ok: true, output, executor: "worker-engine-v1", tokens: 0 };
    }

    return {
      ok: true,
      output: {
        workerId: worker.workerId,
        taskId: task.id,
        kind: "unhandled-task",
        reasoning: { summary: "Task accepted by the worker bridge but no domain handler is registered yet.", assumptions: ["Domain handler must be added before the task can influence trading decisions."], evidenceIds: [] },
        toolCalls,
      },
      executor: "worker-engine-v1",
    };
  }
}

export function createWorkerEngineExecutor(engine: TradingWorkerTaskEngine) {
  return <T>(context: WorkerExecutionContext<T>): Promise<WorkerExecutionResult> => engine.execute(context);
}

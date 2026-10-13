export interface MarketShock {
  type: "latency" | "spread" | "liquidity" | "correlation" | "exchange_outage" | "partial_fill";
  severity: number;
  durationMs: number;
}

export interface SimulationInput {
  midPrice: number;
  bidSize: number;
  askSize: number;
  requestedQty: number;
  side: "buy" | "sell";
  latencyMs: number;
  baseSpreadBps: number;
  shocks?: MarketShock[];
  seed?: number;
}

export interface SimulationResult {
  filledQty: number;
  avgFillPrice: number;
  slippageBps: number;
  rejected: boolean;
  rejectReason?: string;
  effectiveLatencyMs: number;
  stressScore: number;
}

function clamp(value: number, min: number, max: number): number { return Math.max(min, Math.min(max, value)); }

export function simulateExecution(input: SimulationInput): SimulationResult {
  if (!(input.midPrice > 0) || !(input.requestedQty > 0)) throw new Error("invalid_simulation_input");
  const shocks = input.shocks ?? [];
  const outage = shocks.find((s) => s.type === "exchange_outage" && s.severity >= 0.8);
  if (outage) return { filledQty: 0, avgFillPrice: input.midPrice, slippageBps: 0, rejected: true, rejectReason: "exchange_outage", effectiveLatencyMs: input.latencyMs + outage.durationMs, stressScore: clamp(outage.severity, 0, 1) };
  const spread = input.baseSpreadBps * (1 + shocks.filter((s) => s.type === "spread").reduce((x, s) => x + Math.max(0, s.severity), 0));
  const liquidityMultiplier = clamp(1 - shocks.filter((s) => s.type === "liquidity").reduce((x, s) => x + Math.max(0, s.severity), 0) * 0.7, 0.05, 1);
  const available = Math.max(0, Math.min(input.bidSize, input.askSize) * liquidityMultiplier);
  const partial = shocks.filter((s) => s.type === "partial_fill").reduce((x, s) => x + Math.max(0, s.severity), 0);
  const fillCap = available * clamp(1 - partial, 0, 1);
  const filledQty = Math.min(input.requestedQty, fillCap);
  const impactBps = input.requestedQty > 0 ? (filledQty > 0 ? (filledQty / Math.max(available, 1)) * spread * 0.6 : spread) : 0;
  const adverseLatency = shocks.filter((s) => s.type === "latency").reduce((x, s) => x + Math.max(0, s.severity * s.durationMs), 0);
  const correlation = shocks.filter((s) => s.type === "correlation").reduce((x, s) => x + Math.max(0, s.severity), 0);
  const slippageBps = impactBps * (1 + correlation * 0.5) + Math.max(0, input.latencyMs + adverseLatency) / 1000 * 0.05;
  const signedSlippage = input.side === "buy" ? slippageBps : -slippageBps;
  const avgFillPrice = input.midPrice * (1 + signedSlippage / 10_000);
  const stressScore = clamp((spread / Math.max(input.baseSpreadBps, 0.1)) * 0.2 + (1 - liquidityMultiplier) * 0.5 + correlation * 0.2 + partial * 0.1, 0, 1);
  return { filledQty, avgFillPrice, slippageBps, rejected: filledQty <= 0, rejectReason: filledQty <= 0 ? "insufficient_liquidity" : undefined, effectiveLatencyMs: input.latencyMs + adverseLatency, stressScore };
}

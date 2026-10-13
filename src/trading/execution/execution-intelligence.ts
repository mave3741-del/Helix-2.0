export type ExecutionAlgorithm = "market" | "twap" | "vwap";

export interface VenueQuote {
  venue: string;
  bid: number;
  ask: number;
  bidSize: number;
  askSize: number;
  feeBps: number;
  healthy: boolean;
}

export interface ExecutionPlan {
  algorithm: ExecutionAlgorithm;
  venue: string;
  slices: Array<{ qty: number; targetPrice: number; offsetMs: number }>;
  expectedSlippageBps: number;
  expectedFeesBps: number;
  queueRisk: number;
}

export interface ExecutionFill {
  venue: string;
  qty: number;
  price: number;
  benchmarkPrice: number;
  fee: number;
  slippageBps: number;
}

export interface ExecutionQuality {
  implementationShortfallBps: number;
  feeBps: number;
  slippageBps: number;
  fillRate: number;
  qualityScore: number;
}

export function scoreVenue(q: VenueQuote, side: "buy" | "sell"): number {
  if (!q.healthy || q.bid <= 0 || q.ask <= q.bid) return Number.NEGATIVE_INFINITY;
  const spreadBps = ((q.ask - q.bid) / ((q.ask + q.bid) / 2)) * 10_000;
  const depth = Math.log1p(Math.min(q.bidSize, q.askSize));
  const sizeBias = side === "buy" ? q.askSize : q.bidSize;
  return depth * 2 + Math.log1p(sizeBias) - spreadBps * 0.25 - q.feeBps;
}

export function chooseVenue(quotes: VenueQuote[], side: "buy" | "sell"): VenueQuote {
  const ranked = quotes.map((q) => ({ q, score: scoreVenue(q, side) })).filter((x) => Number.isFinite(x.score)).sort((a, b) => b.score - a.score);
  if (!ranked[0]) throw new Error("no_healthy_venue");
  return ranked[0].q;
}

export function buildExecutionPlan(input: {
  side: "buy" | "sell";
  qty: number;
  referencePrice: number;
  quotes: VenueQuote[];
  algorithm?: ExecutionAlgorithm;
  slices?: number;
  horizonMs?: number;
}): ExecutionPlan {
  if (!(input.qty > 0) || !(input.referencePrice > 0)) throw new Error("invalid_execution_request");
  const venue = chooseVenue(input.quotes, input.side);
  const algorithm = input.algorithm ?? "twap";
  const slices = Math.max(1, Math.min(32, Math.floor(input.slices ?? 8)));
  const horizonMs = Math.max(1, input.horizonMs ?? 60_000);
  const qtyPerSlice = input.qty / slices;
  const midpoint = (venue.bid + venue.ask) / 2;
  const halfSpread = (venue.ask - venue.bid) / 2;
  const target = algorithm === "market" ? (input.side === "buy" ? venue.ask : venue.bid) : midpoint;
  const expectedSlippageBps = Math.max(0, ((Math.abs(target - input.referencePrice) / input.referencePrice) * 10_000) + (halfSpread / input.referencePrice) * 10_000);
  return {
    algorithm,
    venue: venue.venue,
    slices: Array.from({ length: slices }, (_, i) => ({ qty: qtyPerSlice, targetPrice: target, offsetMs: algorithm === "market" ? 0 : Math.floor((i * horizonMs) / slices) })),
    expectedSlippageBps,
    expectedFeesBps: venue.feeBps,
    queueRisk: Math.min(1, qtyPerSlice / Math.max(venue.bidSize, venue.askSize, 1)),
  };
}

export function attributeExecutionQuality(input: { requestedQty: number; benchmarkPrice: number; fills: ExecutionFill[] }): ExecutionQuality {
  const filledQty = input.fills.reduce((s, f) => s + f.qty, 0);
  if (!(input.requestedQty > 0) || !(input.benchmarkPrice > 0)) throw new Error("invalid_execution_attribution");
  const weightedPrice = filledQty > 0 ? input.fills.reduce((s, f) => s + f.price * f.qty, 0) / filledQty : input.benchmarkPrice;
  const implementationShortfallBps = ((weightedPrice - input.benchmarkPrice) / input.benchmarkPrice) * 10_000;
  const fee = input.fills.reduce((s, f) => s + f.fee, 0);
  const feeBps = input.benchmarkPrice * filledQty > 0 ? fee / (input.benchmarkPrice * filledQty) * 10_000 : 0;
  const slippageBps = filledQty > 0 ? input.fills.reduce((s, f) => s + Math.abs(f.slippageBps) * f.qty, 0) / filledQty : 0;
  const fillRate = Math.min(1, filledQty / input.requestedQty);
  const qualityScore = Math.max(0, Math.min(100, 100 - Math.abs(implementationShortfallBps) * 2 - feeBps - slippageBps * 0.5 + fillRate * 10));
  return { implementationShortfallBps, feeBps, slippageBps, fillRate, qualityScore };
}

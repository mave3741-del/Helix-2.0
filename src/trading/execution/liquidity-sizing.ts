import type { VenueQuote } from './execution-intelligence.ts';

export interface LiquiditySizingInput {
  desiredQty: number;
  side: 'buy' | 'sell';
  maxParticipationPct: number;
  throttleMultiplier?: number;
  riskCapital?: number;
  referencePrice?: number;
  quote: VenueQuote;
}

export interface LiquiditySizingResult {
  approvedQty: number;
  notional: number;
  participationPct: number;
  depthLimited: boolean;
  throttled: boolean;
  rationale: string[];
}

export function sizeForLiquidity(input: LiquiditySizingInput): LiquiditySizingResult {
  if (!(input.desiredQty > 0) || !(input.quote.bid > 0) || !(input.quote.ask > input.quote.bid)) throw new Error('invalid_liquidity_sizing_input');
  if (input.maxParticipationPct <= 0 || input.maxParticipationPct > 1) throw new Error('invalid_participation_limit');
  const depth = input.side === 'buy' ? input.quote.askSize : input.quote.bidSize;
  const depthCap = depth * input.maxParticipationPct;
  const throttle = Math.max(0, Math.min(1, input.throttleMultiplier ?? 1));
  const riskQtyCap = input.riskCapital !== undefined && input.referencePrice && input.referencePrice > 0 ? input.riskCapital / input.referencePrice : Number.POSITIVE_INFINITY;
  const approvedQty = Math.max(0, Math.min(input.desiredQty, depthCap, riskQtyCap) * throttle);
  const notional = approvedQty * (input.referencePrice ?? ((input.quote.bid + input.quote.ask) / 2));
  const participationPct = depth > 0 ? approvedQty / depth : 1;
  const rationale: string[] = [];
  if (approvedQty < input.desiredQty) rationale.push('liquidity_or_risk_cap_applied');
  if (throttle < 1) rationale.push('execution_quality_throttle_applied');
  if (approvedQty <= depthCap) rationale.push('within_top_of_book_participation');
  return { approvedQty, notional, participationPct, depthLimited: approvedQty < input.desiredQty && approvedQty <= depthCap, throttled: throttle < 1, rationale };
}

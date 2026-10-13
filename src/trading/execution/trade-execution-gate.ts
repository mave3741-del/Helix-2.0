import type { TradeCandidateDecision } from "../trade-candidate-council.ts";
import { evaluateExecutionReadiness } from "../execution-readiness.ts";
import { nativeRiskCheck, type Position, type RiskLimits } from "../../runtime/tools/trading.ts";

export interface TradeExecutionGateInput {
  decision: TradeCandidateDecision;
  price: number;
  equity: number;
  risk: RiskLimits;
  dailyPnl?: number;
  peakEquity?: number;
  currentPosition?: { qty: number; avgPrice: number } | null;
  exposures?: Array<{ symbol: string; notional: number; side: "long" | "short"; sector?: string; market?: string }>;
  correlationToPortfolio?: number;
  sector?: string;
  market?: string;
  confidenceSizing?: boolean;
}

export interface PaperOrderIntent {
  clientOrderId: string;
  symbol: string;
  market: string;
  venue: string;
  side: "buy" | "sell";
  qty: number;
  price: number;
  notional: number;
  confidence: number;
  rationale: string[];
  evidenceIds: string[];
  strategyAction: "buy" | "sell";
  strategyId?: string;
  regime?: string;
  decisionSubjectId: string;
  decisionAction: "buy" | "sell";
  decisionConfidence: number;
  participantIds: string[];
  councilIds: string[];
}

export interface TradeExecutionGateResult {
  approved: boolean;
  stage: "approved" | "rejected";
  reasons: string[];
  risk?: {
    notional: number;
    maxQty: number;
    projectedLeverage: number;
    drawdownPct: number;
  };
  intent?: PaperOrderIntent;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function stableUnique(values: string[]): string[] {
  return [...new Set(values)].sort();
}

function signedPosition(input: TradeExecutionGateInput): Position | null {
  const current = input.currentPosition;
  if (!current || current.qty === 0) return null;
  return {
    symbol: input.decision.symbol,
    side: current.qty > 0 ? "buy" : "sell",
    qty: Math.abs(current.qty),
    entry: current.avgPrice,
    mark: input.price,
    leverage: 1,
  };
}

function existingGrossExposure(input: TradeExecutionGateInput): number {
  return (input.exposures ?? []).reduce((sum, exposure) => sum + Math.abs(exposure.notional), 0);
}

export function buildPaperOrderIntent(input: TradeExecutionGateInput, now = Date.now()): TradeExecutionGateResult {
  const { decision } = input;
  if (!decision.eligibleForRiskReview) {
    return { approved: false, stage: "rejected", reasons: ["candidate_not_eligible_for_risk_review"] };
  }
  if (decision.action !== "buy" && decision.action !== "sell") {
    return { approved: false, stage: "rejected", reasons: ["candidate_action_not_executable"] };
  }
  if (!(input.price > 0) || !Number.isFinite(input.price)) {
    return { approved: false, stage: "rejected", reasons: ["invalid_market_price"] };
  }
  if (!(input.equity > 0) || !Number.isFinite(input.equity)) {
    return { approved: false, stage: "rejected", reasons: ["invalid_equity"] };
  }

  const confidence = clamp01(decision.confidence);
  const baseNotional = input.equity * Math.max(0, Math.min(1, input.risk.maxOrderPct));
  const sizedNotional = input.confidenceSizing === false ? baseNotional : baseNotional * confidence;
  const qty = sizedNotional / input.price;
  if (!(qty > 0) || !Number.isFinite(qty)) {
    return { approved: false, stage: "rejected", reasons: ["invalid_computed_quantity"] };
  }

  const reasons: string[] = [];
  if (decision.riskVetoed) reasons.push("decision_risk_vetoed");
  if (decision.evidenceIds.length === 0) reasons.push("evidence_required");

  const readiness = evaluateExecutionReadiness({
    equity: input.equity,
    exposures: input.exposures ?? [],
    symbol: decision.symbol,
    orderNotional: qty * input.price,
    sector: input.sector,
    market: input.market ?? decision.market,
    correlationToPortfolio: input.correlationToPortfolio,
  });
  reasons.push(...readiness.reasons);

  const gate = nativeRiskCheck({
    side: decision.action,
    qty,
    price: input.price,
    position: signedPosition(input),
    limits: input.risk,
    dailyPnl: input.dailyPnl ?? 0,
    equity: input.equity,
    existingGrossExposureNotional: existingGrossExposure(input),
    peakEquity: input.peakEquity ?? input.equity,
  });
  reasons.push(...gate.reasons);

  const uniqueReasons = stableUnique(reasons);
  if (uniqueReasons.length > 0) {
    return {
      approved: false,
      stage: "rejected",
      reasons: uniqueReasons,
      risk: {
        notional: gate.notional,
        maxQty: gate.maxQty,
        projectedLeverage: gate.projectedLeverage,
        drawdownPct: gate.drawdownPct,
      },
    };
  }

  return {
    approved: true,
    stage: "approved",
    reasons: [],
    risk: {
      notional: gate.notional,
      maxQty: gate.maxQty,
      projectedLeverage: gate.projectedLeverage,
      drawdownPct: gate.drawdownPct,
    },
    intent: {
      clientOrderId: `paper:candidate:${decision.subjectId}:${decision.action}:${now}`,
      symbol: decision.symbol,
      market: decision.market,
      venue: decision.venue,
      side: decision.action,
      qty,
      price: input.price,
      notional: gate.notional,
      confidence,
      rationale: [...decision.rationale],
      evidenceIds: stableUnique(decision.evidenceIds),
      strategyAction: decision.action,
      decisionSubjectId: decision.subjectId,
      decisionAction: decision.action,
      decisionConfidence: confidence,
      participantIds: stableUnique(decision.participantIds),
      councilIds: stableUnique(decision.councilIds),
    },
  };
}

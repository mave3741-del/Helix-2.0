import type { MarketTick } from "../latency.ts";
import { buildPerformanceSnapshot, type PaperTradeAttribution, type StrategyPerformanceSnapshot } from "../post-trade.ts";
import type { ServerTradingRuntime } from "../runtime/runtime.ts";
import type { PaperFill, PaperOrder } from "../runtime/paper-exchange.ts";
import type { TradeExecutionGateResult } from "./trade-execution-gate.ts";

export interface PaperExecutionFeedback {
  status: "filled" | "rejected";
  clientOrderId: string;
  fill: PaperFill;
  order: PaperOrder | undefined;
  completedTrades: PaperTradeAttribution[];
  strategySnapshot?: StrategyPerformanceSnapshot;
  equity: number;
  realizedPnl: number;
  fees: number;
}

export interface ExecuteApprovedPaperIntentInput {
  runtime: ServerTradingRuntime;
  gate: TradeExecutionGateResult;
  tick: MarketTick;
  strategyId?: string;
  regime?: string;
}

export async function executeApprovedPaperIntent(input: ExecuteApprovedPaperIntentInput): Promise<PaperExecutionFeedback> {
  if (!input.gate.approved || !input.gate.intent) {
    throw new Error("paper_execution_requires_approved_intent");
  }
  const intent = input.gate.intent;
  if (intent.symbol !== input.tick.symbol) throw new Error("paper_execution_symbol_mismatch");
  if (intent.market !== input.tick.market) throw new Error("paper_execution_market_mismatch");
  if (intent.venue !== input.tick.venue) throw new Error("paper_execution_venue_mismatch");
  if (!(intent.qty > 0) || !(intent.price > 0)) throw new Error("paper_execution_invalid_intent");

  const beforeTrades = input.strategyId ? input.runtime.postTrade.trades(input.strategyId).length : 0;
  const fill = await input.runtime.paperOrder({
    clientOrderId: intent.clientOrderId,
    symbol: intent.symbol,
    side: intent.side,
    qty: intent.qty,
    tick: input.tick,
    strategyId: input.strategyId ?? intent.strategyId,
    regime: input.regime ?? intent.regime,
    evidenceIds: intent.evidenceIds,
    decisionSubjectId: intent.decisionSubjectId,
    decisionAction: intent.decisionAction,
    decisionConfidence: intent.decisionConfidence,
    participantIds: intent.participantIds,
    councilIds: intent.councilIds,
  });
  const resolvedStrategyId = input.strategyId ?? intent.strategyId;
  const completedTrades = resolvedStrategyId
    ? input.runtime.postTrade.trades(resolvedStrategyId).slice(beforeTrades)
    : [];
  const strategySnapshot = resolvedStrategyId && completedTrades.length
    ? await buildPerformanceSnapshot(resolvedStrategyId, input.runtime.postTrade.trades(resolvedStrategyId), fill.ts)
    : undefined;
  const account = input.runtime.paper.snapshot();
  return {
    status: "filled",
    clientOrderId: intent.clientOrderId,
    fill,
    order: input.runtime.paper.getOrder(intent.clientOrderId),
    completedTrades,
    strategySnapshot,
    equity: account.equity,
    realizedPnl: account.realizedPnl,
    fees: account.fees,
  };
}

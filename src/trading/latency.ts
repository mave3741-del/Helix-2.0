export type MarketVenue = "crypto" | "equity" | "fx" | "futures" | "options" | "commodities" | "rates";

export interface MarketTick {
  symbol: string;
  venue: string;
  market: MarketVenue;
  bid: number;
  ask: number;
  last: number;
  bidSize: number;
  askSize: number;
  sequence: number;
  exchangeTs: number;
  receivedTs: number;
}

export interface FastSignal {
  symbol: string;
  side: "buy" | "sell" | "flat";
  strength: number;
  reason: string[];
  tickSequence: number;
  generatedTs: number;
  maxAgeMs: number;
}

export interface FastRiskSnapshot {
  dailyCapitalLimit: number;
  allocatedCapital: number;
  maxPositionNotional: number;
  maxPortfolioDrawdown: number;
  killSwitch: boolean;
  staleAfterMs: number;
}

export interface LatencyBudget {
  observeMs: number;
  featureMs: number;
  signalMs: number;
  riskMs: number;
  routeMs: number;
}

export const DEFAULT_LATENCY_BUDGET: LatencyBudget = {
  observeMs: 2,
  featureMs: 2,
  signalMs: 2,
  riskMs: 1,
  routeMs: 3,
};

export function tickAgeMs(tick: MarketTick, now = Date.now()): number {
  return Math.max(0, now - tick.exchangeTs);
}

/**
 * Deterministic fast path. No LLM/network call belongs here.
 * It is intentionally conservative: stale data or crossed/invalid quotes produce no trade signal.
 */
export function emitFastSignal(tick: MarketTick, now = Date.now()): FastSignal {
  const age = tickAgeMs(tick, now);
  if (age > 250 || tick.bid <= 0 || tick.ask <= 0 || tick.ask < tick.bid) {
    return { symbol: tick.symbol, side: "flat", strength: 0, reason: ["stale-or-invalid-market-data"], tickSequence: tick.sequence, generatedTs: now, maxAgeMs: 100 };
  }

  const spread = tick.ask - tick.bid;
  const mid = (tick.ask + tick.bid) / 2;
  const imbalance = (tick.bidSize - tick.askSize) / Math.max(1, tick.bidSize + tick.askSize);
  const spreadBps = (spread / mid) * 10_000;
  const strength = Math.min(1, Math.abs(imbalance) * 1.5);

  if (spreadBps > 30 || Math.abs(imbalance) < 0.12) {
    return { symbol: tick.symbol, side: "flat", strength: 0, reason: ["weak-or-expensive-microstructure"], tickSequence: tick.sequence, generatedTs: now, maxAgeMs: 100 };
  }

  return {
    symbol: tick.symbol,
    side: imbalance > 0 ? "buy" : "sell",
    strength,
    reason: ["order-book-imbalance", `spread-bps:${spreadBps.toFixed(2)}`],
    tickSequence: tick.sequence,
    generatedTs: now,
    maxAgeMs: 100,
  };
}

export function canPassFastRisk(notional: number, signal: FastSignal, risk: FastRiskSnapshot, tick: MarketTick, now = Date.now()): boolean {
  if (risk.killSwitch) return false;
  if (tickAgeMs(tick, now) > risk.staleAfterMs) return false;
  if (signal.side === "flat" || signal.strength <= 0) return false;
  if (notional > risk.maxPositionNotional) return false;
  if (risk.allocatedCapital + notional > risk.dailyCapitalLimit) return false;
  return true;
}

export function totalFastPathBudgetMs(budget: LatencyBudget = DEFAULT_LATENCY_BUDGET): number {
  return budget.observeMs + budget.featureMs + budget.signalMs + budget.riskMs + budget.routeMs;
}

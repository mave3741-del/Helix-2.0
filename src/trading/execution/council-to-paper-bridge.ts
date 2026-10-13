import { fetchCandles, fetchTicker } from "@/trading/market-data/ccxt-connector";
import { nativeRegimeClassify, nativeTechnicalSignal, nativeZScore, type Bar } from "@/runtime/tools/trading";
import { reconcileCouncilReviews, type CouncilReviewInput, type ReconciledCouncilVote } from "@/trading/trade-candidate-council";
import type { ServerTradingRuntime } from "@/trading/runtime/runtime";

/**
 * This is the bridge from council decision-making to real (paper) trade
 * execution. It is deliberately built on the same `reconcileCouncilReviews`
 * voting math the news-propagation pipeline uses, so both paths share one
 * tested risk-veto/weighted-voting core instead of drifting apart.
 *
 * Why three councils (technical / quant / risk) rather than the full named
 * roster: these are the three that can be computed purely from live market
 * data with no external LLM call, so this bridge works fully offline/free.
 * Each one maps to a real native signal already proven in
 * `src/runtime/tools/trading.ts`:
 *   - technical (VORTEX): moving-average crossover + momentum
 *   - quant (QUANTUM): return z-score (mean-reversion read, often in
 *     intentional tension with the trend-following technical read)
 *   - risk (AEGIS): volatility-regime classification, with the absolute
 *     veto power `reconcileCouncilReviews` already gives any "risk" stance
 *
 * Upgrade path: once a real LLM-driven multi-round debate backend exists,
 * additional councils (macro, fundamental, news, adversarial, ...) can feed
 * more `CouncilReviewInput`s into the same `reconcileCouncilReviews` call
 * without changing this bridge's execution logic at all.
 */

export interface CouncilTradeRun {
  symbol: string;
  exchange: string;
  reviews: CouncilReviewInput[];
  decision: ReconciledCouncilVote;
}

const MIN_BARS = 10;

export function councilDecisionFromBars(exchange: string, symbol: string, bars: Bar[]): CouncilTradeRun {
  if (bars.length < MIN_BARS) {
    throw new Error(`Not enough recent candles (${bars.length}/${MIN_BARS}) to form a council decision for ${symbol}`);
  }
  const tech = nativeTechnicalSignal(bars, 10, 30);
  const closes = bars.map((b) => b.close);
  const returns = closes.slice(1).map((c, i) => (closes[i] > 0 ? c / closes[i] - 1 : 0));
  const z = nativeZScore(returns, Math.min(30, returns.length));
  const regime = nativeRegimeClassify({ returns, volatility: tech.volatility });
  const evidenceIds = [`candles:${exchange}:${symbol}:${bars.at(-1)?.ts ?? 0}`];

  const reviews: CouncilReviewInput[] = [
    {
      workerId: "vortex-ma-crossover",
      councilId: "technical",
      stance: tech.signal === "long" ? "bull" : tech.signal === "short" ? "bear" : "neutral",
      confidence: Math.min(0.95, Math.abs(tech.momentum) * 6),
      rationale: `MA crossover: fast=${tech.fastSma.toFixed(2)} slow=${tech.slowSma.toFixed(2)} momentum=${(tech.momentum * 100).toFixed(2)}%`,
      evidenceIds,
    },
    {
      workerId: "quantum-zscore",
      councilId: "quant",
      stance: z > 1.2 ? "bear" : z < -1.2 ? "bull" : "neutral",
      confidence: Math.min(0.9, Math.abs(z) / 3),
      rationale: `Return z-score=${z.toFixed(2)} over ${returns.length} bars`,
      evidenceIds,
    },
    {
      workerId: "aegis-regime",
      councilId: "risk",
      stance: regime === "high-volatility" ? "bear" : "neutral",
      confidence: regime === "high-volatility" ? Math.min(0.95, tech.volatility * 20) : 0.4,
      rationale: `Regime=${regime}, volatility=${(tech.volatility * 100).toFixed(2)}%`,
      evidenceIds,
    },
  ];
  return { symbol, exchange, reviews, decision: reconcileCouncilReviews(reviews) };
}

export async function runQuantCouncilDecision(exchange: string, symbol: string): Promise<CouncilTradeRun> {
  const candles = await fetchCandles(exchange, symbol, "1h", 60);
  const bars: Bar[] = candles.map((c) => ({ ts: c.time, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume }));
  return councilDecisionFromBars(exchange, symbol, bars);
}

export interface CouncilExecutionResult {
  run: CouncilTradeRun;
  executed: boolean;
  reason: string;
  orderQty?: number;
}

export async function executeCouncilDecision(
  runtime: ServerTradingRuntime,
  exchange: string,
  symbol: string,
  maxNotionalPct = 0.05,
): Promise<CouncilExecutionResult> {
  const run = await runQuantCouncilDecision(exchange, symbol);
  if (run.decision.action !== "buy" && run.decision.action !== "sell") {
    return { run, executed: false, reason: `No trade — council action is "${run.decision.action}" (${run.decision.rationale.join(", ")})` };
  }
  const ticker = await fetchTicker(exchange, symbol);
  if (!ticker.bid || !ticker.ask) return { run, executed: false, reason: `No live bid/ask for ${symbol} on ${exchange}` };
  const price = run.decision.action === "buy" ? ticker.ask : ticker.bid;
  const equity = runtime.paper.snapshot().equity;
  const notional = equity * maxNotionalPct * run.decision.confidence;
  const qty = notional / price;
  if (!(qty > 0)) return { run, executed: false, reason: "Computed order size was zero — equity or confidence too low" };
  await runtime.paperOrder({
    clientOrderId: `council-${Date.now()}`,
    symbol,
    side: run.decision.action,
    qty,
    tick: {
      symbol,
      venue: exchange,
      market: "crypto",
      last: ticker.last ?? price,
      bid: ticker.bid,
      ask: ticker.ask,
      bidSize: 1000,
      askSize: 1000,
      exchangeTs: ticker.timestamp ?? Date.now(),
      receivedTs: Date.now(),
      sequence: Date.now(),
    },
  });
  return {
    run,
    executed: true,
    reason: `Executed ${run.decision.action} ${qty.toFixed(6)} ${symbol} @ ~${price.toFixed(2)} (confidence ${(run.decision.confidence * 100).toFixed(0)}%)`,
    orderQty: qty,
  };
}

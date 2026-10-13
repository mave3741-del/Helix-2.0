export type Side = "buy" | "sell";
export type Signal = "long" | "short" | "flat";

export interface Bar {
  ts: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface BookLevel {
  price: number;
  size: number;
}

export interface OrderBook {
  bids: BookLevel[];
  asks: BookLevel[];
}

export interface MarketSnapshot {
  symbol: string;
  ts: number;
  price: number;
  spreadBps: number;
  imbalance: number;
  freshnessMs: number;
  source: string;
}

export interface RiskLimits {
  capital: number;
  maxPositionPct: number;
  maxOrderPct: number;
  maxDailyLossPct: number;
  maxDrawdownPct: number;
  maxLeverage: number;
}

export interface Position {
  symbol: string;
  side: Side;
  qty: number;
  entry: number;
  mark: number;
  leverage: number;
}

export interface StrategyScore {
  expectancy: number;
  sharpe: number;
  maxDrawdown: number;
  profitFactor: number;
  turnover: number;
  robustness: number;
  score: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function mean(values: number[]): number {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

export function nativeMarketSnapshot(input: {
  symbol: string;
  price: number;
  bids: BookLevel[];
  asks: BookLevel[];
  ts?: number;
  receivedAt?: number;
  source?: string;
}): MarketSnapshot {
  const ts = input.ts ?? Date.now();
  const receivedAt = input.receivedAt ?? Date.now();
  const bestBid = input.bids[0]?.price ?? input.price;
  const bestAsk = input.asks[0]?.price ?? input.price;
  const mid = (bestBid + bestAsk) / 2 || input.price;
  const spreadBps = mid > 0 ? ((bestAsk - bestBid) / mid) * 10_000 : 0;
  const bidSize = input.bids.slice(0, 10).reduce((s, x) => s + Math.max(0, x.size), 0);
  const askSize = input.asks.slice(0, 10).reduce((s, x) => s + Math.max(0, x.size), 0);
  const total = bidSize + askSize;
  const imbalance = total ? (bidSize - askSize) / total : 0;
  return {
    symbol: input.symbol,
    ts,
    price: input.price,
    spreadBps,
    imbalance: clamp(imbalance, -1, 1),
    freshnessMs: Math.max(0, receivedAt - ts),
    source: input.source ?? "unknown",
  };
}

export function nativeRiskCheck(input: {
  side: Side;
  qty: number;
  price: number;
  position: Position | null;
  limits: RiskLimits;
  dailyPnl: number;
  equity: number;
  /** Optional portfolio exposure already committed by other positions/orders. */
  existingGrossExposureNotional?: number;
  /** Optional high-water-mark equity used for hard drawdown enforcement. */
  peakEquity?: number;
}): { ok: boolean; reasons: string[]; notional: number; maxQty: number; projectedLeverage: number; drawdownPct: number } {
  const reasons: string[] = [];
  const notional = Math.abs(input.qty * input.price);
  const maxNotional = input.limits.capital * clamp(input.limits.maxOrderPct, 0, 1);
  const maxPosition = input.limits.capital * clamp(input.limits.maxPositionPct, 0, 1);
  const maxQty = input.price > 0 ? maxNotional / input.price : 0;
  const equity = Number.isFinite(input.equity) ? input.equity : 0;

  if (!Number.isFinite(notional) || notional <= 0) reasons.push("invalid_notional");
  if (notional > maxNotional + 1e-9) reasons.push("order_limit_exceeded");
  if (!Number.isFinite(input.limits.maxLeverage) || input.limits.maxLeverage <= 0) reasons.push("invalid_leverage_limit");

  const currentSigned = (input.position?.side === input.side ? 1 : -1) * (input.position?.qty ?? 0);
  const orderSigned = (input.side === "buy" ? 1 : -1) * Math.abs(input.qty);
  const projectedSigned = currentSigned + orderSigned;
  const projectedPositionNotional = Math.abs(projectedSigned * input.price);
  if (projectedPositionNotional > maxPosition + 1e-9) reasons.push("position_limit_exceeded");

  const existingGross = Math.max(0, input.existingGrossExposureNotional ?? 0);
  const projectedLeverage = equity > 0 ? (existingGross + notional) / equity : Number.POSITIVE_INFINITY;
  if (projectedLeverage > Math.max(0, input.limits.maxLeverage) + 1e-9) reasons.push("leverage_limit_exceeded");

  const peakEquity = Math.max(0, input.peakEquity ?? equity);
  const drawdownPct = peakEquity > 0 ? Math.max(0, (peakEquity - equity) / peakEquity) : 0;
  if (drawdownPct >= clamp(input.limits.maxDrawdownPct, 0, 1) - 1e-12 && input.limits.maxDrawdownPct >= 0) {
    reasons.push("max_drawdown_exceeded");
  }

  const dailyLossLimit = -Math.abs(input.equity * clamp(input.limits.maxDailyLossPct, 0, 1));
  if (input.dailyPnl <= dailyLossLimit) reasons.push("daily_loss_limit_reached");

  return { ok: reasons.length === 0, reasons, notional, maxQty, projectedLeverage, drawdownPct };
}

export function nativeTechnicalSignal(bars: Bar[], fast = 10, slow = 30): {
  signal: Signal;
  momentum: number;
  volatility: number;
  fastSma: number;
  slowSma: number;
} {
  const closes = bars.map((b) => b.close).filter((x) => Number.isFinite(x) && x > 0);
  const fastCloses = closes.slice(-Math.max(2, fast));
  const slowCloses = closes.slice(-Math.max(2, slow));
  const fastSma = mean(fastCloses);
  const slowSma = mean(slowCloses);
  const first = closes[Math.max(0, closes.length - Math.max(2, fast))] ?? fastSma;
  const last = closes.at(-1) ?? 0;
  const momentum = first > 0 ? (last - first) / first : 0;
  const returns = closes.slice(1).map((c, i) => closes[i] > 0 ? (c / closes[i]) - 1 : 0);
  const volMean = mean(returns);
  const volatility = Math.sqrt(mean(returns.map((r) => (r - volMean) ** 2)));
  const signal = fastSma > slowSma && momentum > 0 ? "long" : fastSma < slowSma && momentum < 0 ? "short" : "flat";
  return { signal, momentum, volatility, fastSma, slowSma };
}

export function nativePositionSize(input: {
  equity: number;
  riskPct: number;
  entry: number;
  stop: number;
  maxLeverage?: number;
}): { qty: number; notional: number; riskAmount: number } {
  const riskAmount = Math.max(0, input.equity * clamp(input.riskPct, 0, 1));
  const stopDistance = Math.abs(input.entry - input.stop);
  if (riskAmount <= 0 || stopDistance <= 0 || input.entry <= 0) return { qty: 0, notional: 0, riskAmount };
  const rawQty = riskAmount / stopDistance;
  const leverageCap = Math.max(1, input.maxLeverage ?? 1);
  const maxQty = (input.equity * leverageCap) / input.entry;
  const qty = Math.min(rawQty, maxQty);
  return { qty, notional: qty * input.entry, riskAmount };
}

export function nativeBacktest(bars: Bar[], signalFn: (window: Bar[], index: number) => Signal, feeBps = 5, slippageBps = 2): {
  trades: number;
  grossReturn: number;
  netReturn: number;
  maxDrawdown: number;
  sharpeLike: number;
  equityCurve: number[];
} {
  if (bars.length < 3) return { trades: 0, grossReturn: 0, netReturn: 0, maxDrawdown: 0, sharpeLike: 0, equityCurve: [1] };
  let equity = 1;
  let peak = 1;
  let side: Signal = "flat";
  let trades = 0;
  const returns: number[] = [];
  const curve = [equity];

  for (let i = 1; i < bars.length; i += 1) {
    const sig = signalFn(bars.slice(0, i + 1), i);
    const ret = bars[i - 1].close > 0 ? bars[i].close / bars[i - 1].close - 1 : 0;
    const direction = sig === "long" ? 1 : sig === "short" ? -1 : 0;
    const held = side === "long" ? 1 : side === "short" ? -1 : 0;
    if (direction !== held) {
      if (direction !== 0 || held !== 0) trades += 1;
      side = sig;
    }
    const friction = Math.abs(direction - held) * ((feeBps + slippageBps) / 10_000);
    const pnl = held * ret - friction;
    equity *= Math.max(0, 1 + pnl);
    peak = Math.max(peak, equity);
    returns.push(pnl);
    curve.push(equity);
  }

  const meanRet = mean(returns);
  const sd = Math.sqrt(mean(returns.map((r) => (r - meanRet) ** 2)));
  let maxDrawdown = 0;
  let runningPeak = 1;
  for (const e of curve) {
    runningPeak = Math.max(runningPeak, e);
    maxDrawdown = Math.max(maxDrawdown, runningPeak > 0 ? (runningPeak - e) / runningPeak : 0);
  }
  return {
    trades,
    grossReturn: curve.at(-1)! - 1,
    netReturn: curve.at(-1)! - 1,
    maxDrawdown,
    sharpeLike: sd > 0 ? (meanRet / sd) * Math.sqrt(returns.length) : 0,
    equityCurve: curve,
  };
}

export function nativeStrategyScore(input: {
  returns: number[];
  maxDrawdown: number;
  turnover: number;
  robustness: number;
}): StrategyScore {
  const avg = mean(input.returns);
  const sd = Math.sqrt(mean(input.returns.map((r) => (r - avg) ** 2)));
  const sharpe = sd > 0 ? (avg / sd) * Math.sqrt(input.returns.length) : 0;
  const wins = input.returns.filter((r) => r > 0).reduce((a, b) => a + b, 0);
  const losses = Math.abs(input.returns.filter((r) => r < 0).reduce((a, b) => a + b, 0));
  const expectancy = avg;
  const profitFactor = losses > 0 ? wins / losses : wins > 0 ? 999 : 0;
  const score = expectancy * 100 + sharpe * 2 + input.robustness * 20 - input.maxDrawdown * 30 - input.turnover * 5;
  return { expectancy, sharpe, maxDrawdown: input.maxDrawdown, profitFactor, turnover: input.turnover, robustness: input.robustness, score };
}

export function nativePaperOrder(input: {
  symbol: string;
  side: Side;
  qty: number;
  bid: number;
  ask: number;
  ts?: number;
  feeBps?: number;
}): {
  symbol: string;
  side: Side;
  qty: number;
  fill: number;
  fee: number;
  ts: number;
  slippageBps: number;
} {
  const fill = input.side === "buy" ? input.ask : input.bid;
  const mid = (input.ask + input.bid) / 2 || fill;
  const fee = Math.abs(input.qty * fill) * ((input.feeBps ?? 5) / 10_000);
  const slippageBps = mid > 0 ? Math.abs(fill - mid) / mid * 10_000 : 0;
  return { symbol: input.symbol, side: input.side, qty: input.qty, fill, fee, ts: input.ts ?? Date.now(), slippageBps };
}

export function nativeRsi(closes: number[], period = 14): number {
  const p = Math.max(2, Math.min(period, closes.length - 1));
  let gains = 0;
  let losses = 0;
  for (let i = closes.length - p; i < closes.length; i += 1) {
    const delta = closes[i] - closes[i - 1];
    if (delta >= 0) gains += delta;
    else losses -= delta;
  }
  if (losses === 0) return 100;
  const rs = (gains / p) / (losses / p);
  return 100 - (100 / (1 + rs));
}

export function nativeAtr(bars: Bar[], period = 14): number {
  const p = Math.max(2, Math.min(period, bars.length - 1));
  if (bars.length < 2 || p < 2) return 0;
  const trs: number[] = [];
  for (let i = 1; i < bars.length; i += 1) {
    const prevClose = bars[i - 1].close;
    trs.push(Math.max(bars[i].high - bars[i].low, Math.abs(bars[i].high - prevClose), Math.abs(bars[i].low - prevClose)));
  }
  return mean(trs.slice(-p));
}

export function nativeZScore(values: number[], window = 30): number {
  const v = values.slice(-Math.max(2, window));
  if (v.length < 2) return 0;
  const avg = mean(v);
  const sd = Math.sqrt(mean(v.map((x) => (x - avg) ** 2)));
  return sd > 0 ? ((v.at(-1)! - avg) / sd) : 0;
}

export function nativeWhaleSignal(input: {
  inflow: number;
  outflow: number;
  baseline: number;
  priceChangePct: number;
}): { score: number; label: "accumulation" | "distribution" | "neutral"; reasons: string[] } {
  const netFlow = input.outflow - input.inflow;
  const scale = Math.max(Math.abs(input.baseline), 1);
  const flowScore = clamp(netFlow / scale, -1, 1);
  const priceScore = clamp(input.priceChangePct / 10, -1, 1);
  const score = clamp(flowScore * 0.7 + priceScore * 0.3, -1, 1);
  const label = score > 0.25 ? "accumulation" : score < -0.25 ? "distribution" : "neutral";
  const reasons = [
    `normalized_net_flow=${flowScore.toFixed(3)}`,
    `normalized_price_change=${priceScore.toFixed(3)}`,
    "signal_is_evidence_not_trade_instruction",
  ];
  return { score, label, reasons };
}

export function nativeRegimeClassify(input: { returns: number[]; volatility: number }): "trend" | "mean-reverting" | "high-volatility" | "uncertain" {
  const z = nativeZScore(input.returns, Math.min(30, input.returns.length));
  if (input.volatility > 0.03) return "high-volatility";
  if (z > 0.75 || z < -0.75) return "trend";
  if (Math.abs(z) < 0.25) return "mean-reverting";
  return "uncertain";
}

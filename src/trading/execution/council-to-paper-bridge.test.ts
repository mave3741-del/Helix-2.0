import test from "node:test";
import assert from "node:assert/strict";
import { councilDecisionFromBars } from "./council-to-paper-bridge.ts";
import type { Bar } from "@/runtime/tools/trading";

function makeBars(closes: number[]): Bar[] {
  return closes.map((close, i) => ({
    ts: i * 3_600_000,
    open: close,
    high: close * 1.001,
    low: close * 0.999,
    close,
    volume: 1_000,
  }));
}

// A smooth, strong, constant-step trend with small deterministic jitter
// (Math.sin-based, never Math.random, so the test stays reproducible).
// Deliberately NOT a perfectly linear trend (that drives the quant z-score
// to exactly 0, dropping it as a non-participant) and NOT an accelerating
// "late breakout" trend (that pushes quant's mean-reversion read directly
// opposite technical's trend-following read). This shape keeps quant
// near-neutral while technical alone clears the actionability bar.
function steadyUptrend(n: number, start = 100, stepPct = 0.018): number[] {
  const closes: number[] = [start];
  for (let i = 1; i < n; i += 1) {
    const jitter = Math.sin(i * 1.7) * stepPct * 0.15;
    closes.push(closes[i - 1] * (1 + stepPct + jitter));
  }
  return closes;
}

function steadyDowntrend(n: number, start = 100, stepPct = 0.018): number[] {
  return steadyUptrend(n, start, -stepPct);
}

function flat(n: number, price = 100): number[] {
  return Array.from({ length: n }, () => price);
}

function wildSwings(n: number, start = 100): number[] {
  const closes: number[] = [start];
  for (let i = 1; i < n; i += 1) {
    const swing = i % 2 === 0 ? 1.12 : 1 / 1.12;
    closes.push(closes[i - 1] * swing);
  }
  return closes;
}

test("throws when there aren't enough bars to form a council decision", () => {
  assert.throws(() => councilDecisionFromBars("binance", "BTC/USDT", makeBars(flat(5))), /Not enough recent candles/);
});

test("a steady, low-volatility uptrend reconciles to a real buy from the technical+quant+risk councils", () => {
  const run = councilDecisionFromBars("binance", "BTC/USDT", makeBars(steadyUptrend(40)));
  assert.equal(run.decision.action, "buy");
  assert.equal(run.decision.riskVetoed, false);
  assert.ok(run.decision.participantIds.length >= 3, `expected >=3 participants, got ${run.decision.participantIds.length}`);
  const technical = run.reviews.find((r) => r.councilId === "technical");
  assert.equal(technical?.stance, "bull");
});

test("a steady downtrend reconciles to sell", () => {
  const run = councilDecisionFromBars("binance", "BTC/USDT", makeBars(steadyDowntrend(40)));
  assert.equal(run.decision.action, "sell");
  const technical = run.reviews.find((r) => r.councilId === "technical");
  assert.equal(technical?.stance, "bear");
});

test("a flat market reconciles to hold — no edge to trade", () => {
  const run = councilDecisionFromBars("binance", "BTC/USDT", makeBars(flat(40)));
  assert.equal(run.decision.action, "hold");
});

test("extreme volatility triggers the risk council's veto even when technical is bullish", () => {
  const run = councilDecisionFromBars("binance", "BTC/USDT", makeBars(wildSwings(40)));
  const risk = run.reviews.find((r) => r.councilId === "risk");
  assert.equal(risk?.stance, "bear");
  assert.ok(risk && risk.confidence >= 0.8, `expected risk confidence >= 0.8, got ${risk?.confidence}`);
  assert.equal(run.decision.riskVetoed, true);
  assert.equal(run.decision.action, "reject");
});

test("evidenceIds trace back to the specific symbol/exchange/bar used, never fabricated", () => {
  const bars = makeBars(steadyUptrend(40));
  const run = councilDecisionFromBars("kraken", "ETH/USDT", bars);
  const expected = `candles:kraken:ETH/USDT:${bars.at(-1)?.ts}`;
  for (const review of run.reviews) {
    assert.deepEqual(review.evidenceIds, [expected]);
  }
  assert.deepEqual(run.decision.evidenceIds, [expected]);
});

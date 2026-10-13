import { simulateExecution, type MarketShock } from './market-simulation.ts';

export type ReplayStress = 'latency' | 'spread' | 'liquidity' | 'correlation' | 'venue-outage' | 'partial-fill';

export interface ReplayMarketCase {
  symbol: string;
  midPrice: number;
  bidSize: number;
  askSize: number;
  side: 'buy' | 'sell';
  qty: number;
  baseSpreadBps: number;
  latencyMs: number;
}

export interface ReplayResult {
  symbol: string;
  stress: ReplayStress;
  rejected: boolean;
  slippageBps: number;
  fillRatio: number;
  stressPenalty: number;
}

const SHOCKS: Record<ReplayStress, MarketShock[]> = {
  latency: [{ type: 'latency', severity: 1, durationMs: 3000 }],
  spread: [{ type: 'spread', severity: 7, durationMs: 1000 }],
  liquidity: [{ type: 'liquidity', severity: 1, durationMs: 1000 }],
  correlation: [{ type: 'correlation', severity: 4, durationMs: 1000 }],
  'venue-outage': [{ type: 'exchange_outage', severity: 1, durationMs: 5000 }],
  'partial-fill': [{ type: 'partial_fill', severity: 0.65, durationMs: 1000 }],
};

export function runAdversarialReplay(cases: ReplayMarketCase[], stresses: ReplayStress[] = Object.keys(SHOCKS) as ReplayStress[]): ReplayResult[] {
  const out: ReplayResult[] = [];
  for (const input of cases) for (const stress of stresses) {
    const result = simulateExecution({
      midPrice: input.midPrice,
      bidSize: input.bidSize,
      askSize: input.askSize,
      requestedQty: input.qty,
      side: input.side,
      latencyMs: input.latencyMs,
      baseSpreadBps: input.baseSpreadBps,
      shocks: SHOCKS[stress],
    });
    const fillRatio = input.qty > 0 ? result.filledQty / input.qty : 0;
    const stressPenalty = (result.rejected ? 1 : 0.0) + Math.min(1, result.slippageBps / 100) * 0.5 + (1 - fillRatio) * 0.5;
    out.push({ symbol: input.symbol, stress, rejected: result.rejected, slippageBps: result.slippageBps, fillRatio, stressPenalty });
  }
  return out;
}

export function replayRobustness(results: ReplayResult[]): number {
  if (!results.length) return 0;
  const meanPenalty = results.reduce((sum, r) => sum + Math.min(1, r.stressPenalty), 0) / results.length;
  return Math.max(0, 1 - meanPenalty);
}

import { simulateExecution, type MarketShock } from "./simulation/market-simulation.ts";

export interface BenchmarkScenario {
  id: string;
  market: string;
  shocks: MarketShock[];
}

export interface BenchmarkAgent {
  id: string;
  decide(input: { market: string; midPrice: number }): { action: "buy" | "sell" | "hold"; confidence: number; rationale: string };
}

export interface BenchmarkScore {
  agentId: string;
  scenarios: number;
  executableScenarios: number;
  profitableScenarios: number;
  averageConfidence: number;
  robustness: number;
}

export function benchmarkAgent(agent: BenchmarkAgent, scenarios: BenchmarkScenario[]): BenchmarkScore {
  let executable = 0;
  let profitable = 0;
  let confidence = 0;
  for (const scenario of scenarios) {
    const decision = agent.decide({ market: scenario.market, midPrice: 100 });
    confidence += Math.max(0, Math.min(1, decision.confidence));
    if (decision.action === "hold") continue;
    executable += 1;
    const result = simulateExecution({
      midPrice: 100,
      bidSize: 100,
      askSize: 100,
      requestedQty: 10,
      side: decision.action,
      latencyMs: 100,
      baseSpreadBps: 5,
      shocks: scenario.shocks,
    });
    if (!result.rejected && result.slippageBps < 25 && decision.confidence >= 0.6) profitable += 1;
  }
  const robustness = scenarios.length ? (profitable / Math.max(executable, 1)) * (0.5 + 0.5 * (confidence / scenarios.length)) : 0;
  return { agentId: agent.id, scenarios: scenarios.length, executableScenarios: executable, profitableScenarios: profitable, averageConfidence: scenarios.length ? confidence / scenarios.length : 0, robustness };
}

export function rankBenchmarkScores(scores: BenchmarkScore[]): BenchmarkScore[] {
  return [...scores].sort((a, b) => b.robustness - a.robustness);
}

import { attributePaperTrade, type PaperTradeAttribution } from '../post-trade.ts';
import { InMemoryClosedLoopStore, runClosedLoopCycle, type ClosedLoopCycleResult, type ClosedLoopPolicy, type StrategyCycleState, type StrategyLearningProfile } from './closed-loop.ts';

export interface MultiCycleSimulationResult {
  cycles: ClosedLoopCycleResult[];
  convergenceCycle: number | null;
  maxTurnoverDelta: number;
  retirements: string[];
  failClosedCycles: number;
  regimeCoverage: string[];
}

const regimes = ['trend', 'range', 'high-volatility', 'liquidity-stress'] as const;

function deterministicTrades(strategyId: string, cycle: number, regime: string): PaperTradeAttribution[] {
  const base = strategyId === 'a' ? 2 : strategyId === 'b' ? 1.2 : .7;
  const regimeAdj = regime === 'trend' ? 1 : regime === 'range' ? .8 : regime === 'high-volatility' ? .6 : .4;
  const sign = strategyId === 'c' && cycle >= 2 ? -1 : 1;
  return [0,1,2,3].map((i) => attributePaperTrade({
    tradeId:`sim:${cycle}:${regime}:${strategyId}:${i}`, strategyId, symbol:`SIM-${i}`, side:'buy', qty:1,
    entryPrice:100, entryBenchmarkPrice:100, exitPrice:100 + sign * base * regimeAdj,
    exitBenchmarkPrice:100 + sign * base * regimeAdj, grossPnl:sign * base * regimeAdj,
    fees:.02, slippageCost:.01, holdingMs:3_600_000, regime, evidenceIds:[`sim-e:${cycle}:${regime}`], createdAt:cycle * 10_000 + i,
  }));
}

export async function runDeterministicMultiCycleSimulation(policy: ClosedLoopPolicy): Promise<MultiCycleSimulationResult> {
  const store = new InMemoryClosedLoopStore();
  const cycles: ClosedLoopCycleResult[] = [];
  let priorState: StrategyCycleState[] = [];
  const profiles: StrategyLearningProfile[] = [
    { strategyId:'a', experimentId:'exp-a', expectedReturn:.15, volatility:.1, sharpe:1.5, robustness:.9, turnover:.1, correlationToPortfolio:.15, status:'champion' },
    { strategyId:'b', experimentId:'exp-b', expectedReturn:.11, volatility:.11, sharpe:1.2, robustness:.82, turnover:.12, correlationToPortfolio:.05, status:'challenger' },
    { strategyId:'c', experimentId:'exp-c', expectedReturn:.08, volatility:.13, sharpe:.8, robustness:.76, turnover:.14, correlationToPortfolio:.2, status:'challenger' },
  ];

  for (let cycle = 1; cycle <= 4; cycle += 1) {
    const allTrades = regimes.flatMap((regime) => profiles.flatMap((profile) => deterministicTrades(profile.strategyId, cycle, regime)));
    const result = await runClosedLoopCycle({
      cycleId:`multi-cycle:${cycle}`,
      asOfTs:cycle * 100_000,
      trades:allTrades,
      profiles,
      priorState,
      realizedReturns:Object.fromEntries(profiles.map((p)=>[p.strategyId, p.strategyId === 'c' && cycle >= 2 ? -0.25 : p.strategyId === 'a' ? .8 : .45])),
      realizedRisk:Object.fromEntries(profiles.map((p)=>[p.strategyId, p.strategyId === 'a' ? .1 : .15])),
    }, policy);
    cycles.push(result);
    await store.save(result);
    priorState = result.decisions.map((d) => ({ strategyId:d.strategyId, negativeCycles:d.negativeCycles }));
  }

  const weights = cycles.map((cycle) => new Map(cycle.allocations.map((a)=>[a.strategyId,a.weight])));
  let maxTurnoverDelta = 0;
  for (let i=1;i<weights.length;i+=1) {
    const ids = new Set([...weights[i-1].keys(), ...weights[i].keys()]);
    let delta = 0;
    for (const id of ids) delta += Math.abs((weights[i].get(id) ?? 0) - (weights[i-1].get(id) ?? 0));
    maxTurnoverDelta = Math.max(maxTurnoverDelta, delta);
  }
  const convergenceCycle = cycles.findIndex((cycle, index) => index > 0 && JSON.stringify(cycle.allocations) === JSON.stringify(cycles[index-1]?.allocations)) + 1 || null;
  const retirements = [...new Set(cycles.flatMap((cycle)=>cycle.decisions.filter((d)=>d.action==='retire').map((d)=>d.strategyId)))];
  return { cycles, convergenceCycle, maxTurnoverDelta, retirements, failClosedCycles:cycles.filter((c)=>c.failClosed).length, regimeCoverage:[...regimes] };
}

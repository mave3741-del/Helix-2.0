import { createHash } from "node:crypto";
import type { Bar } from "../../runtime/tools/trading.ts";

export type RlStressScenario =
  | "regime-shift"
  | "volatility-spike"
  | "degraded-data"
  | "transaction-cost-shock"
  | "liquidity-shock";

export interface RlStressMetrics {
  netReturn: number;
  maxDrawdown: number;
  sharpe: number;
}

export interface RlStressCase {
  scenario: RlStressScenario;
  bars: Bar[];
  feeBps: number;
  slippageBps: number;
  degraded: boolean;
}

export interface RlStressInput {
  bars: Bar[];
  environmentHash: string;
  algorithm: string;
  seed: number;
  scenarios?: RlStressScenario[];
  baseFeeBps?: number;
  baseSlippageBps?: number;
  evaluate: (input: RlStressCase) => RlStressMetrics;
}

export interface RlStressGate {
  minScenarioPassRate: number;
  minNetReturn: number;
  maxDrawdown: number;
  minSharpe: number;
  allowDegradedDataPass: boolean;
}

export interface RlStressResult {
  scenarios: Array<RlStressCase & { metrics: RlStressMetrics; passed: boolean; reasons: string[] }>;
  aggregate: { scenarioCount: number; passedScenarios: number; passRate: number; worstReturn: number; worstDrawdown: number; worstSharpe: number };
  gate: { eligible: boolean; reasons: string[] };
  deterministicHash: string;
}

const DEFAULT_SCENARIOS: RlStressScenario[] = ["regime-shift", "volatility-spike", "degraded-data", "transaction-cost-shock", "liquidity-shock"];
const stable=(v:unknown):string=>v===null||typeof v!=="object"?JSON.stringify(v):Array.isArray(v)?`[${v.map(stable).join(",")}]`:`{${Object.keys(v as Record<string,unknown>).sort().map(k=>`${JSON.stringify(k)}:${stable((v as Record<string,unknown>)[k])}`).join(",")}}`;
const hash=(v:unknown)=>createHash("sha256").update(stable(v),"utf8").digest("hex");
const finite=(v:number)=>Number.isFinite(v);

function transformBars(source:Bar[], scenario:RlStressScenario): {bars:Bar[]; degraded:boolean} {
  if (!source.length) throw new Error("rl_stress_bars_required");
  const bars=source.slice().sort((a,b)=>a.ts-b.ts).map(b=>({...b}));
  if (bars.some(b=>![b.ts,b.open,b.high,b.low,b.close,b.volume].every(Number.isFinite))) throw new Error("rl_stress_non_finite_bar");
  if (scenario==="regime-shift") {
    const pivot=Math.floor(bars.length/2);
    for(let i=pivot;i<bars.length;i++){ const b=bars[i]!; const anchor=bars[pivot-1]?.close??b.close; const move=anchor+(anchor-b.close)*0.5; b.close=Math.max(Number.EPSILON,move); b.high=Math.max(b.high,b.close); b.low=Math.min(b.low,b.close); }
  } else if (scenario==="volatility-spike") {
    for(let i=Math.floor(bars.length/2);i<bars.length;i++){ const b=bars[i]!; const mid=(b.high+b.low)/2; b.high=mid+(b.high-mid)*3; b.low=Math.max(Number.EPSILON,mid-(mid-b.low)*3); }
  } else if (scenario==="degraded-data") {
    const start=Math.floor(bars.length*0.6);
    for(let i=start;i<bars.length;i+=3){ const b=bars[i]!; b.volume=0; b.open=Number.NaN; }
    return {bars,degraded:true};
  } else if (scenario==="liquidity-shock") {
    for(let i=Math.floor(bars.length/2);i<bars.length;i++){ const b=bars[i]!; b.volume=Math.max(0,b.volume*0.1); }
  }
  return {bars,degraded:false};
}

export function evaluateRlStress(input:RlStressInput, gate:RlStressGate):RlStressResult {
  if(!input.environmentHash.trim()) throw new Error("rl_stress_environment_hash_required");
  if(!input.algorithm.trim()) throw new Error("rl_stress_algorithm_required");
  if(!Number.isInteger(input.seed)) throw new Error("rl_stress_seed_invalid");
  for(const [name,v] of Object.entries(gate)){ if(name!=="allowDegradedDataPass" && !finite(v as number)) throw new Error("rl_stress_gate_invalid"); }
  if(gate.minScenarioPassRate<0||gate.minScenarioPassRate>1||gate.maxDrawdown<0) throw new Error("rl_stress_gate_invalid");
  const scenarios=[...new Set(input.scenarios??DEFAULT_SCENARIOS)];
  if(!scenarios.length) throw new Error("rl_stress_scenarios_required");
  const baseFee=input.baseFeeBps??5, baseSlip=input.baseSlippageBps??2;
  if(!finite(baseFee)||baseFee<0||!finite(baseSlip)||baseSlip<0) throw new Error("rl_stress_cost_invalid");
  const results=scenarios.map(scenario=>{
    const transformed=transformBars(input.bars,scenario);
    const costs=scenario==="transaction-cost-shock"?{feeBps:baseFee*4,slippageBps:baseSlip*4}:{feeBps:baseFee,slippageBps:baseSlip};
    if(transformed.degraded && !gate.allowDegradedDataPass) return {...transformed,bars:transformed.bars,scenario,feeBps:costs.feeBps,slippageBps:costs.slippageBps,metrics:{netReturn:-Infinity,maxDrawdown:Infinity,sharpe:-Infinity},passed:false,reasons:["degraded_data_fail_closed"]};
    const metrics=input.evaluate({...transformed,scenario,feeBps:costs.feeBps,slippageBps:costs.slippageBps});
    if(!finite(metrics.netReturn)||!finite(metrics.maxDrawdown)||!finite(metrics.sharpe)) return {...transformed,scenario,feeBps:costs.feeBps,slippageBps:costs.slippageBps,metrics,passed:false,reasons:["non_finite_metrics"]};
    const reasons:string[]=[];
    if(metrics.netReturn<gate.minNetReturn) reasons.push("net_return_below_gate");
    if(metrics.maxDrawdown>gate.maxDrawdown) reasons.push("drawdown_above_gate");
    if(metrics.sharpe<gate.minSharpe) reasons.push("sharpe_below_gate");
    return {...transformed,scenario,feeBps:costs.feeBps,slippageBps:costs.slippageBps,metrics,passed:reasons.length===0,reasons};
  });
  const passed=results.filter(r=>r.passed).length;
  const finiteResults=results.filter(r=>finite(r.metrics.netReturn)&&finite(r.metrics.maxDrawdown)&&finite(r.metrics.sharpe));
  const aggregate={scenarioCount:results.length,passedScenarios:passed,passRate:passed/results.length,worstReturn:finiteResults.length?Math.min(...finiteResults.map(r=>r.metrics.netReturn)):-Infinity,worstDrawdown:finiteResults.length?Math.max(...finiteResults.map(r=>r.metrics.maxDrawdown)):Infinity,worstSharpe:finiteResults.length?Math.min(...finiteResults.map(r=>r.metrics.sharpe)):-Infinity};
  const reasons:string[]=[]; if(aggregate.passRate<gate.minScenarioPassRate) reasons.push("scenario_pass_rate_below_gate"); if(aggregate.worstReturn<gate.minNetReturn) reasons.push("worst_return_below_gate"); if(aggregate.worstDrawdown>gate.maxDrawdown) reasons.push("worst_drawdown_above_gate"); if(aggregate.worstSharpe<gate.minSharpe) reasons.push("worst_sharpe_below_gate");
  return {scenarios:results,aggregate,gate:{eligible:reasons.length===0,reasons},deterministicHash:hash({environmentHash:input.environmentHash,algorithm:input.algorithm,seed:input.seed,scenarios:results.map(r=>({scenario:r.scenario,feeBps:r.feeBps,slippageBps:r.slippageBps,metrics:r.metrics,passed:r.passed,reasons:r.reasons})),aggregate,gate})};
}

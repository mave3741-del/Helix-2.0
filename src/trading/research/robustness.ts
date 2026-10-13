export interface ParameterSensitivityResult {
  baseScore: number;
  perturbations: number;
  minScore: number;
  medianScore: number;
  maxScore: number;
  stableFraction: number;
  passed: boolean;
}

export interface BootstrapResult {
  samples: number;
  seed: number;
  lowerQuantile: number;
  median: number;
  upperQuantile: number;
  probabilityPositive: number;
  passed: boolean;
}

function hashSeed(seed: number, i: number): number {
  let x = (seed ^ Math.imul(i + 1, 0x9e3779b9)) >>> 0;
  x ^= x >>> 16; x = Math.imul(x, 0x85ebca6b) >>> 0; x ^= x >>> 13; x = Math.imul(x, 0xc2b2ae35) >>> 0; x ^= x >>> 16;
  return x >>> 0;
}
function unit(seed: number, i: number): number { return hashSeed(seed, i) / 0x1_0000_0000; }
function quantile(xs: number[], q: number): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a,b)=>a-b); const p=(s.length-1)*q; const lo=Math.floor(p), hi=Math.ceil(p);
  return s[lo] + (s[hi]-s[lo])*(p-lo);
}

/** Deterministic parameter perturbation test. evaluator must be pure and must not read future/OOS data. */
export function evaluateParameterSensitivity(input:{baseParams:Record<string,number>; maxRelativeDelta?:number; steps?:number; evaluate:(params:Record<string,number>)=>number; minimumStableFraction?:number}): ParameterSensitivityResult {
  const delta=Math.min(0.5,Math.max(0.01,input.maxRelativeDelta??0.1)); const steps=Math.max(1,Math.floor(input.steps??5));
  const base=input.evaluate({...input.baseParams}); const scores=[base];
  const keys=Object.keys(input.baseParams).sort();
  for(let step=1;step<=steps;step++) for(const key of keys){ const p={...input.baseParams}; const sign=step%2?1:-1; p[key]=Math.max(0,p[key]*(1+sign*delta*(step/steps))); scores.push(input.evaluate(p)); }
  const threshold=base>=0?base*0.8:base*1.2; const stable=scores.filter(x=>Number.isFinite(x)&&x>=threshold).length/scores.length;
  return {baseScore:base,perturbations:scores.length-1,minScore:Math.min(...scores),medianScore:quantile(scores,0.5),maxScore:Math.max(...scores),stableFraction:stable,passed:stable>=(input.minimumStableFraction??0.7)};
}

/** Seeded bootstrap over realized returns. No Math.random: replayable and auditable. */
export function deterministicBootstrapReturns(returns:number[], input:{samples?:number; seed?:number; positiveProbabilityFloor?:number}={}): BootstrapResult {
  const xs=returns.filter(Number.isFinite); const samples=Math.max(100,Math.floor(input.samples??1000)); const seed=input.seed??1;
  if(xs.length<30) return {samples,seed,lowerQuantile:0,median:0,upperQuantile:0,probabilityPositive:0,passed:false};
  const means:number[]=[]; let positive=0;
  for(let s=0;s<samples;s++){ let sum=0; for(let i=0;i<xs.length;i++){ const j=Math.floor(unit(seed,s*xs.length+i)*xs.length); sum+=xs[j]; } const m=sum/xs.length; means.push(m); if(m>0) positive++; }
  const probabilityPositive=positive/samples;
  return {samples,seed,lowerQuantile:quantile(means,0.025),median:quantile(means,0.5),upperQuantile:quantile(means,0.975),probabilityPositive,passed:quantile(means,0.025)>0&&probabilityPositive>=(input.positiveProbabilityFloor??0.95)};
}

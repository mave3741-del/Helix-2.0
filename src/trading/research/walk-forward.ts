import { nativeBacktest, type Bar, type Signal } from "../../runtime/tools/trading.ts";

export interface WalkForwardFold { index:number; trainStart:number; trainEnd:number; testStart:number; testEnd:number; metrics:{ trades:number; netReturn:number; maxDrawdown:number; sharpeLike:number; }; }
export interface WalkForwardResult { folds:WalkForwardFold[]; aggregate:{folds:number; profitableFolds:number; medianReturn:number; worstDrawdown:number; meanSharpe:number; robustness:number}; }
export type FittedStrategy = (history: Bar[]) => Signal;

function median(v:number[]):number { if(!v.length) return 0; const s=[...v].sort((a,b)=>a-b); const m=Math.floor(s.length/2); return s.length%2?s[m]:(s[m-1]+s[m])/2; }

/**
 * Walk-forward validation. The fitter receives training data only. During the
 * test window it is called with a history prefix that never contains future
 * test bars, preventing a strategy implementation from peeking ahead.
 */
export function runWalkForward(input:{bars:Bar[]; trainBars:number; testBars:number; stepBars?:number; embargoBars?:number; feeBps?:number; slippageBps?:number; fit:(train:Bar[],fold:number)=>FittedStrategy}):WalkForwardResult {
  const bars=[...input.bars].sort((a,b)=>a.ts-b.ts); const train=Math.max(2,Math.floor(input.trainBars)); const test=Math.max(1,Math.floor(input.testBars)); const step=Math.max(1,Math.floor(input.stepBars??test)); const embargo=Math.max(0,Math.floor(input.embargoBars??0));
  const folds:WalkForwardFold[]=[]; let index=0;
  for(let trainStart=0; trainStart+train+embargo+test<=bars.length; trainStart+=step){
    const trainEnd=trainStart+train; const testStart=trainEnd+embargo; const testEnd=testStart+test; const trainBars=bars.slice(trainStart,trainEnd); const testBars=bars.slice(testStart,testEnd);
    const decide=input.fit(structuredClone(trainBars),index);
    const signals=testBars.map((_,i)=>decide([...trainBars,...testBars.slice(0,i+1)]));
    const result=nativeBacktest(testBars,(_window,i)=>signals[i]??"flat",input.feeBps??5,input.slippageBps??2);
    folds.push({index,trainStart:trainBars[0].ts,trainEnd:trainBars.at(-1)!.ts,testStart:testBars[0].ts,testEnd:testBars.at(-1)!.ts,metrics:{trades:result.trades,netReturn:result.netReturn,maxDrawdown:result.maxDrawdown,sharpeLike:result.sharpeLike}}); index+=1;
  }
  const returns=folds.map(f=>f.metrics.netReturn); const drawdowns=folds.map(f=>f.metrics.maxDrawdown); const sharpes=folds.map(f=>f.metrics.sharpeLike); const profitable=returns.filter(x=>x>0).length;
  const aggregate={folds:folds.length,profitableFolds:profitable,medianReturn:median(returns),worstDrawdown:drawdowns.length?Math.max(...drawdowns):0,meanSharpe:sharpes.length?sharpes.reduce((a,b)=>a+b,0)/sharpes.length:0,robustness:folds.length?profitable/folds.length:0};
  return {folds,aggregate};
}

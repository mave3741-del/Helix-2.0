import test from "node:test";
import assert from "node:assert/strict";
import { shouldUseHighVolatilityMode } from "./market-regime-trigger.ts";
const base=(vol:number)=>({symbol:"X",venue:"test",market:"equity" as const,last:100,bid:99,ask:101,volatility:vol,liquidityScore:1,timestamp:1_000});
test("regime trigger enters high-volatility mode deterministically",()=>{assert.equal(shouldUseHighVolatilityMode(Array.from({length:10},()=>base(.1)),1000,{minimumStressMarkets:5}),true);});
test("regime trigger remains normal below stress threshold",()=>{assert.equal(shouldUseHighVolatilityMode(Array.from({length:10},()=>base(.01)),1000,{minimumStressMarkets:5}),false);});

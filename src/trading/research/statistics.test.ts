import test from "node:test";
import assert from "node:assert/strict";
import { evaluateStatisticalEvidence, passesPromotionStatistics } from "./statistics.ts";

test("promotion statistics fail closed on small samples", () => {
  const e=evaluateStatisticalEvidence({returns:Array.from({length:20},()=>0.01),maxDrawdown:.1,robustness:.9});
  assert.equal(e.significantAt95,false);
  assert.equal(passesPromotionStatistics(e),false);
});

test("promotion statistics require meaningful sample and significance", () => {
  const returns=Array.from({length:60},(_,i)=>0.008+(i%3)*0.002);
  const e=evaluateStatisticalEvidence({returns,maxDrawdown:.1,robustness:.8,candidateCount:1});
  assert.equal(e.tradeCount,60);
  assert.equal(e.significantAt95,true);
  assert.equal(passesPromotionStatistics(e),true);
});

test("multiple testing reduces promotion evidence", () => {
  const returns=Array.from({length:60},(_,i)=>0.008+(i%3)*0.002);
  const one=evaluateStatisticalEvidence({returns,maxDrawdown:.1,robustness:.8,candidateCount:1});
  const many=evaluateStatisticalEvidence({returns,maxDrawdown:.1,robustness:.8,candidateCount:100000});
  assert.ok(many.multipleTestingPenalty < one.multipleTestingPenalty);
  assert.ok(many.adjustedScore < one.adjustedScore);
});

import test from "node:test";
import assert from "node:assert/strict";
import { runWalkForward } from "./walk-forward.ts";

test("walk-forward keeps training and OOS windows strictly separated", () => {
  const bars = Array.from({length: 12}, (_, i) => ({ts:i, open:100+i, high:101+i, low:99+i, close:100+i, volume:1}));
  const result = runWalkForward({ bars, trainBars: 3, testBars: 3, stepBars: 3, fit: (_train) => (_history) => "long" });
  assert.equal(result.folds.length, 3);
  assert.ok(result.folds.every((f) => f.trainEnd < f.testStart));
  assert.equal(result.aggregate.folds, 3);
  assert.equal(result.aggregate.profitableFolds, 3);
});

test("walk-forward fitter receives training data only", () => {
  const bars = Array.from({length: 8}, (_, i) => ({ts:i, open:1, high:2, low:0.5, close:1+i/10, volume:1}));
  let fitTrainEnd = -1;
  const result = runWalkForward({bars,trainBars:3,testBars:2,fit:(train)=>{ fitTrainEnd=train.at(-1)!.ts; return () => "long"; }});
  assert.equal(fitTrainEnd, 4);
  assert.ok(result.folds.every((f) => f.trainEnd < f.testStart));
});

import assert from "node:assert/strict";
import test from "node:test";
import { evaluateWatchdog } from "./watchdog.ts";

const policy = { maxFeedLagMs: 1000, maxQueueLagMs: 1000, maxDbLagMs: 1000, maxWorkerLossRatio: 0.1, maxMemoryPressure: 0.9, maxCpuPressure: 0.9 };

test("watchdog remains normal when healthy", () => {
  assert.equal(evaluateWatchdog({ feedLagMs: 50, queueLagMs: 50, dbLagMs: 50, workerLossRatio: 0, memoryPressure: 0.2, cpuPressure: 0.2 }, policy).mode, "normal");
});

test("watchdog degrades on worker/queue pressure", () => {
  const result = evaluateWatchdog({ feedLagMs: 50, queueLagMs: 2000, dbLagMs: 50, workerLossRatio: 0.2, memoryPressure: 0.2, cpuPressure: 0.2 }, policy);
  assert.equal(result.mode, "degraded");
  assert.equal(result.disableNewCandidates, true);
  assert.equal(result.disablePaperSubmission, false);
});

test("watchdog halts on critical data or database failure", () => {
  const result = evaluateWatchdog({ feedLagMs: 2000, queueLagMs: 10, dbLagMs: 2000, workerLossRatio: 0, memoryPressure: 0, cpuPressure: 0 }, policy);
  assert.equal(result.mode, "halted");
  assert.equal(result.disablePaperSubmission, true);
});

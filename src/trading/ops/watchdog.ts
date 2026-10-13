export type SystemMode = "normal" | "degraded" | "halted";

export interface WatchdogSnapshot {
  feedLagMs: number;
  queueLagMs: number;
  dbLagMs: number;
  workerLossRatio: number;
  memoryPressure: number;
  cpuPressure: number;
}

export interface WatchdogPolicy {
  maxFeedLagMs: number;
  maxQueueLagMs: number;
  maxDbLagMs: number;
  maxWorkerLossRatio: number;
  maxMemoryPressure: number;
  maxCpuPressure: number;
}

export interface WatchdogDecision {
  mode: SystemMode;
  reasons: string[];
  disableNewCandidates: boolean;
  disablePaperSubmission: boolean;
}

export function evaluateWatchdog(snapshot: WatchdogSnapshot, policy: WatchdogPolicy): WatchdogDecision {
  const reasons: string[] = [];
  if (snapshot.feedLagMs > policy.maxFeedLagMs) reasons.push("feed_lag");
  if (snapshot.queueLagMs > policy.maxQueueLagMs) reasons.push("queue_lag");
  if (snapshot.dbLagMs > policy.maxDbLagMs) reasons.push("db_lag");
  if (snapshot.workerLossRatio > policy.maxWorkerLossRatio) reasons.push("worker_loss");
  if (snapshot.memoryPressure > policy.maxMemoryPressure) reasons.push("memory_pressure");
  if (snapshot.cpuPressure > policy.maxCpuPressure) reasons.push("cpu_pressure");
  const halted = reasons.includes("feed_lag") || reasons.includes("db_lag");
  const degraded = reasons.length > 0;
  return {
    mode: halted ? "halted" : degraded ? "degraded" : "normal",
    reasons,
    disableNewCandidates: degraded,
    disablePaperSubmission: halted,
  };
}

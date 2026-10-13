export type Severity = 'info' | 'warning' | 'critical';

export interface ObservabilityEvent {
  ts: number;
  severity: Severity;
  name: string;
  message: string;
  attributes: Record<string, string | number | boolean>;
}

export interface ObservabilityThresholds {
  maxCriticalEvents: number;
  maxErrorRate: number;
  maxLatencyMs: number;
}

export interface ObservabilitySnapshot {
  requestCount: number;
  errorCount: number;
  errorRate: number;
  p95LatencyMs: number;
  criticalEvents: number;
  alerts: string[];
}

export class ObservabilityBus {
  private readonly events: ObservabilityEvent[] = [];
  private readonly latencies: number[] = [];
  private requestCount = 0;
  private errorCount = 0;

  recordRequest(latencyMs: number, ok: boolean): void {
    if (Number.isFinite(latencyMs) && latencyMs >= 0) this.latencies.push(latencyMs);
    this.requestCount += 1;
    if (!ok) this.errorCount += 1;
  }

  emit(event: Omit<ObservabilityEvent, 'ts'> & { ts?: number }): void {
    this.events.push({ ...event, ts: event.ts ?? Date.now() });
    if (this.events.length > 10_000) this.events.splice(0, this.events.length - 10_000);
  }

  snapshot(thresholds: ObservabilityThresholds): ObservabilitySnapshot {
    const sorted = [...this.latencies].sort((a, b) => a - b);
    const index = sorted.length ? Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1) : 0;
    const p95LatencyMs = sorted[index] ?? 0;
    const errorRate = this.requestCount ? this.errorCount / this.requestCount : 0;
    const criticalEvents = this.events.filter((event) => event.severity === 'critical').length;
    const alerts = [
      ...(errorRate > thresholds.maxErrorRate ? ['error_rate_threshold'] : []),
      ...(p95LatencyMs > thresholds.maxLatencyMs ? ['latency_threshold'] : []),
      ...(criticalEvents > thresholds.maxCriticalEvents ? ['critical_event_threshold'] : []),
    ];
    return { requestCount: this.requestCount, errorCount: this.errorCount, errorRate, p95LatencyMs, criticalEvents, alerts };
  }

  recent(limit = 100): ObservabilityEvent[] {
    return this.events.slice(-Math.max(1, limit));
  }
}

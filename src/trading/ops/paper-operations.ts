import { createHash, randomUUID } from 'node:crypto';

export type PaperOperationState =
  | 'planned'
  | 'armed'
  | 'running'
  | 'paused'
  | 'rollback'
  | 'completed'
  | 'aborted';

export interface PaperOperationPolicy {
  maximumRejectedOrderRate: number;
  maximumReconciliationMismatches: number;
  maximumCriticalAlerts: number;
  maximumP95LatencyMs: number;
  requireOwnerApproval: boolean;
}

export interface PaperOperationStartInput {
  sessionId?: string;
  readinessReady: boolean;
  ownerApprovalActive: boolean;
  liveExecutionEnabled: boolean;
  policy?: Partial<PaperOperationPolicy>;
}

export interface PaperOperationMetrics {
  observationCycles: number;
  rejectedOrders: number;
  reconciliationMismatches: number;
  criticalAlerts: number;
  p95LatencyMs: number;
}

export interface PaperOperationEvent {
  sequence: number;
  at: number;
  from: PaperOperationState;
  to: PaperOperationState;
  reason: string;
  hash: string;
}

export interface PaperOperationSnapshot {
  sessionId: string;
  state: PaperOperationState;
  liveExecutionEnabled: false;
  metrics: PaperOperationMetrics;
  policy: PaperOperationPolicy;
  events: PaperOperationEvent[];
  snapshotHash: string;
}

const DEFAULT_POLICY: PaperOperationPolicy = {
  maximumRejectedOrderRate: 0.1,
  maximumReconciliationMismatches: 0,
  maximumCriticalAlerts: 0,
  maximumP95LatencyMs: 2_000,
  requireOwnerApproval: true,
};

const TERMINAL = new Set<PaperOperationState>(['completed', 'aborted']);

function hash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function emptyMetrics(): PaperOperationMetrics {
  return {
    observationCycles: 0,
    rejectedOrders: 0,
    reconciliationMismatches: 0,
    criticalAlerts: 0,
    p95LatencyMs: 0,
  };
}

export class PaperOperationSession {
  private state: PaperOperationState = 'planned';
  private metrics: PaperOperationMetrics = emptyMetrics();
  private readonly policy: PaperOperationPolicy;
  private readonly events: PaperOperationEvent[] = [];
  private readonly sessionId: string;

  constructor(input: PaperOperationStartInput) {
    this.sessionId = input.sessionId?.trim() || randomUUID();
    this.policy = { ...DEFAULT_POLICY, ...(input.policy ?? {}) };
    this.validatePolicy();

    if (!input.readinessReady) throw new Error('paper_operation_readiness_not_ready');
    if (this.policy.requireOwnerApproval && !input.ownerApprovalActive) throw new Error('paper_operation_owner_approval_required');
    if (input.liveExecutionEnabled) throw new Error('paper_operation_live_execution_forbidden');
  }

  arm(at = Date.now()): PaperOperationSnapshot {
    this.transition('armed', 'owner_armed_session', at);
    return this.snapshot();
  }

  start(at = Date.now()): PaperOperationSnapshot {
    if (this.state !== 'armed') throw new Error(`paper_operation_invalid_start_state:${this.state}`);
    this.transition('running', 'paper_session_started', at);
    return this.snapshot();
  }

  pause(reason = 'operator_pause', at = Date.now()): PaperOperationSnapshot {
    if (this.state !== 'running') throw new Error(`paper_operation_invalid_pause_state:${this.state}`);
    this.transition('paused', reason, at);
    return this.snapshot();
  }

  resume(at = Date.now()): PaperOperationSnapshot {
    if (this.state !== 'paused') throw new Error(`paper_operation_invalid_resume_state:${this.state}`);
    this.transition('running', 'operator_resume', at);
    return this.snapshot();
  }

  recordMetrics(metrics: PaperOperationMetrics, at = Date.now()): PaperOperationSnapshot {
    if (this.state !== 'running') throw new Error(`paper_operation_not_running:${this.state}`);
    this.metrics = { ...metrics };
    const violations = this.policyViolations();
    if (violations.length > 0) {
      this.transition('rollback', violations.join('|'), at);
    }
    return this.snapshot();
  }

  rollback(reason = 'operator_rollback', at = Date.now()): PaperOperationSnapshot {
    if (TERMINAL.has(this.state)) throw new Error(`paper_operation_terminal:${this.state}`);
    if (this.state !== 'rollback') this.transition('rollback', reason, at);
    return this.snapshot();
  }

  complete(at = Date.now()): PaperOperationSnapshot {
    if (this.state !== 'running' && this.state !== 'paused') throw new Error(`paper_operation_invalid_complete_state:${this.state}`);
    const violations = this.policyViolations();
    if (violations.length > 0) throw new Error(`paper_operation_completion_blocked:${violations.join('|')}`);
    this.transition('completed', 'paper_session_completed', at);
    return this.snapshot();
  }

  abort(reason = 'operator_abort', at = Date.now()): PaperOperationSnapshot {
    if (TERMINAL.has(this.state)) throw new Error(`paper_operation_terminal:${this.state}`);
    this.transition('aborted', reason, at);
    return this.snapshot();
  }


  static restore(snapshot: PaperOperationSnapshot): PaperOperationSession {
    verifyPaperOperationSnapshot(snapshot);
    const session = new PaperOperationSession({
      sessionId: snapshot.sessionId,
      readinessReady: true,
      ownerApprovalActive: true,
      liveExecutionEnabled: false,
      policy: snapshot.policy,
    });
    session.state = snapshot.state;
    session.metrics = structuredClone(snapshot.metrics);
    session.events.splice(0, session.events.length, ...snapshot.events.map((event) => ({ ...event })));
    return session;
  }

  recoverAfterRestart(at = Date.now()): PaperOperationSnapshot {
    if (this.state === 'running') {
      this.transition('paused', 'process_restart_recovery', at);
    }
    return this.snapshot();
  }

  snapshot(): PaperOperationSnapshot {
    const payload = {
      sessionId: this.sessionId,
      state: this.state,
      liveExecutionEnabled: false as const,
      metrics: this.metrics,
      policy: this.policy,
      events: this.events,
    };
    return { ...payload, events: [...this.events], snapshotHash: hash(payload) };
  }

  private transition(to: PaperOperationState, reason: string, at: number): void {
    const from = this.state;
    if (!this.isAllowedTransition(from, to)) throw new Error(`paper_operation_invalid_transition:${from}->${to}`);
    const sequence = this.events.length + 1;
    const eventHash = hash({ sessionId: this.sessionId, sequence, at, from, to, reason, previousHash: this.events.at(-1)?.hash ?? null });
    this.events.push({ sequence, at, from, to, reason, hash: eventHash });
    this.state = to;
  }

  private policyViolations(): string[] {
    const violations: string[] = [];
    const rate = this.metrics.observationCycles > 0 ? this.metrics.rejectedOrders / this.metrics.observationCycles : 0;
    if (rate > this.policy.maximumRejectedOrderRate) violations.push('rejection_rate_exceeded');
    if (this.metrics.reconciliationMismatches > this.policy.maximumReconciliationMismatches) violations.push('reconciliation_mismatch');
    if (this.metrics.criticalAlerts > this.policy.maximumCriticalAlerts) violations.push('critical_alerts_present');
    if (this.metrics.p95LatencyMs > this.policy.maximumP95LatencyMs) violations.push('latency_exceeded');
    return violations;
  }

  private validatePolicy(): void {
    if (!(this.policy.maximumRejectedOrderRate >= 0 && this.policy.maximumRejectedOrderRate <= 1)) throw new Error('invalid_maximum_rejected_order_rate');
    if (this.policy.maximumReconciliationMismatches < 0) throw new Error('invalid_maximum_reconciliation_mismatches');
    if (this.policy.maximumCriticalAlerts < 0) throw new Error('invalid_maximum_critical_alerts');
    if (this.policy.maximumP95LatencyMs <= 0) throw new Error('invalid_maximum_p95_latency');
  }

  private isAllowedTransition(from: PaperOperationState, to: PaperOperationState): boolean {
    const allowed: Record<PaperOperationState, PaperOperationState[]> = {
      planned: ['armed', 'aborted'],
      armed: ['running', 'aborted'],
      running: ['paused', 'rollback', 'completed', 'aborted'],
      paused: ['running', 'rollback', 'aborted', 'completed'],
      rollback: ['aborted'],
      completed: [],
      aborted: [],
    };
    return allowed[from].includes(to);
  }
}

export function isPaperOnlySession(snapshot: PaperOperationSnapshot): boolean {
  return snapshot.liveExecutionEnabled === false && snapshot.events.every((event) => !event.reason.includes('live_execution_enabled'));
}

export function verifyPaperOperationSnapshot(snapshot: PaperOperationSnapshot): void {
  const payload = {
    sessionId: snapshot.sessionId,
    state: snapshot.state,
    liveExecutionEnabled: false as const,
    metrics: snapshot.metrics,
    policy: snapshot.policy,
    events: snapshot.events,
  };
  if (!isPaperOnlySession(snapshot)) throw new Error('paper_operation_not_paper_only');
  if (hash(payload) !== snapshot.snapshotHash) throw new Error('paper_operation_snapshot_hash_mismatch');
  let previousHash: string | null = null;
  for (let index = 0; index < snapshot.events.length; index += 1) {
    const event = snapshot.events[index];
    if (event.sequence !== index + 1) throw new Error('paper_operation_event_sequence_invalid');
    const expected = hash({
      sessionId: snapshot.sessionId,
      sequence: event.sequence,
      at: event.at,
      from: event.from,
      to: event.to,
      reason: event.reason,
      previousHash,
    });
    if (event.hash !== expected) throw new Error('paper_operation_event_hash_mismatch');
    previousHash = event.hash;
  }
}

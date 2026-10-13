import { createHash } from 'node:crypto';
import type { ObservabilityEvent, Severity } from './observability.ts';
import type { PaperOperationMetrics, PaperOperationSession } from './paper-operations.ts';

export type ControlRoomIncident =
  | 'paper_session'
  | 'market_data'
  | 'database'
  | 'worker'
  | 'reconciliation'
  | 'latency'
  | 'security'
  | 'unknown';

export type ControlRoomAction =
  | 'observe'
  | 'pause_paper'
  | 'rollback_paper'
  | 'abort_paper'
  | 'halt_new_candidates'
  | 'escalate';

export interface ControlRoomRunbookStep {
  sequence: number;
  action: ControlRoomAction;
  instruction: string;
  required: boolean;
}

export interface ControlRoomRoute {
  incident: ControlRoomIncident;
  severity: Severity;
  action: ControlRoomAction;
  autoAction: ControlRoomAction | null;
  operatorRequired: boolean;
  reason: string;
  runbook: ControlRoomRunbookStep[];
  routeHash: string;
}

export interface ControlRoomState {
  activeSessionId: string | null;
  metrics: PaperOperationMetrics;
  lastRoute: ControlRoomRoute | null;
  routeCount: number;
  criticalRoutes: number;
}

const RUNBOOKS: Record<ControlRoomIncident, ControlRoomRunbookStep[]> = {
  paper_session: [
    { sequence: 1, action: 'pause_paper', instruction: 'Pause new paper submissions and preserve the current session snapshot.', required: true },
    { sequence: 2, action: 'escalate', instruction: 'Review the session transition journal and operator evidence before resume.', required: true },
    { sequence: 3, action: 'observe', instruction: 'Resume only after the triggering condition is cleared and readiness remains healthy.', required: true },
  ],
  market_data: [
    { sequence: 1, action: 'halt_new_candidates', instruction: 'Stop new candidate generation until source freshness/quorum is healthy.', required: true },
    { sequence: 2, action: 'pause_paper', instruction: 'Pause paper submissions when execution data may be stale or incomplete.', required: true },
    { sequence: 3, action: 'escalate', instruction: 'Inspect feed health, source quorum and sequence gaps before recovery.', required: true },
  ],
  database: [
    { sequence: 1, action: 'rollback_paper', instruction: 'Rollback the active paper session when durable state cannot be trusted.', required: true },
    { sequence: 2, action: 'escalate', instruction: 'Verify database connectivity, lag, migration integrity and persistence health.', required: true },
    { sequence: 3, action: 'observe', instruction: 'Do not resume until durable state verification succeeds.', required: true },
  ],
  worker: [
    { sequence: 1, action: 'halt_new_candidates', instruction: 'Stop dispatch of new work while worker loss or queue instability is investigated.', required: true },
    { sequence: 2, action: 'pause_paper', instruction: 'Pause paper submissions when worker execution integrity is uncertain.', required: true },
    { sequence: 3, action: 'escalate', instruction: 'Inspect worker leases, dead letters, sandbox failures and queue lag.', required: true },
  ],
  reconciliation: [
    { sequence: 1, action: 'rollback_paper', instruction: 'Rollback immediately on a reconciliation mismatch.', required: true },
    { sequence: 2, action: 'escalate', instruction: 'Compare desired, broker/paper, portfolio and audit states using deterministic hashes.', required: true },
    { sequence: 3, action: 'observe', instruction: 'Recovery requires a clean reconciliation before a new session can run.', required: true },
  ],
  latency: [
    { sequence: 1, action: 'pause_paper', instruction: 'Pause paper submissions when latency breaches the configured session threshold.', required: true },
    { sequence: 2, action: 'escalate', instruction: 'Inspect feed, queue, database and execution latency separately.', required: true },
    { sequence: 3, action: 'observe', instruction: 'Resume only after p95 latency returns below policy and remains stable.', required: true },
  ],
  security: [
    { sequence: 1, action: 'abort_paper', instruction: 'Abort the active paper session on a confirmed security boundary violation.', required: true },
    { sequence: 2, action: 'escalate', instruction: 'Preserve evidence, isolate the affected execution path and review credential/access boundaries.', required: true },
    { sequence: 3, action: 'observe', instruction: 'Require an independent review before any paper session is re-armed.', required: true },
  ],
  unknown: [
    { sequence: 1, action: 'pause_paper', instruction: 'Pause paper submissions until the incident is classified.', required: true },
    { sequence: 2, action: 'escalate', instruction: 'Classify the incident and select the matching runbook before recovery.', required: true },
  ],
};

function classify(name: string): ControlRoomIncident {
  const value = name.toLowerCase();
  if (/(reconcil|mismatch)/.test(value)) return 'reconciliation';
  if (/(db|database|migration|snapshot|persist)/.test(value)) return 'database';
  if (/(feed|market|quorum|stale|sequence)/.test(value)) return 'market_data';
  if (/(worker|queue|lease|dead.?letter|sandbox)/.test(value)) return 'worker';
  if (/(latency|p95|slow)/.test(value)) return 'latency';
  if (/(security|credential|secret|escape|permission|key)/.test(value)) return 'security';
  if (/(paper|session|rollback|operation)/.test(value)) return 'paper_session';
  return 'unknown';
}

function hashRoute(payload: Omit<ControlRoomRoute, 'routeHash'>): string {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

function routeFor(event: ObservabilityEvent): ControlRoomRoute {
  const incident = classify(`${event.name} ${event.message}`);
  const severity = event.severity;
  const runbook = RUNBOOKS[incident].map((step) => ({ ...step }));
  let action: ControlRoomAction = 'observe';
  let autoAction: ControlRoomAction | null = null;
  let operatorRequired = false;

  if (severity === 'critical') {
    action = incident === 'security' ? 'abort_paper' : incident === 'reconciliation' || incident === 'database' ? 'rollback_paper' : 'pause_paper';
    autoAction = action;
    operatorRequired = true;
  } else if (severity === 'warning') {
    action = incident === 'market_data' || incident === 'worker' ? 'halt_new_candidates' : 'pause_paper';
    operatorRequired = true;
  }

  const payload = {
    incident,
    severity,
    action,
    autoAction,
    operatorRequired,
    reason: `${incident}:${event.name}`,
    runbook,
  };
  return { ...payload, routeHash: hashRoute(payload) };
}

export class PaperControlRoom {
  private readonly session: PaperOperationSession | null;
  private metrics: PaperOperationMetrics = {
    observationCycles: 0,
    rejectedOrders: 0,
    reconciliationMismatches: 0,
    criticalAlerts: 0,
    p95LatencyMs: 0,
  };
  private lastRoute: ControlRoomRoute | null = null;
  private routeCount = 0;

  constructor(session?: PaperOperationSession | null) {
    this.session = session ?? null;
  }

  observeMetrics(metrics: PaperOperationMetrics, at = Date.now()): void {
    this.metrics = { ...metrics };
    if (this.session) this.session.recordMetrics(this.metrics, at);
  }

  route(event: ObservabilityEvent, at = Date.now()): ControlRoomRoute {
    const route = routeFor(event);
    this.routeCount += 1;
    this.lastRoute = route;
    if (event.severity === 'critical') this.metrics.criticalAlerts += 1;

    if (this.session && route.autoAction) {
      if (route.autoAction === 'pause_paper') {
        if (this.session.snapshot().state === 'running') this.session.pause(`control_room:${event.name}`, at);
      } else if (route.autoAction === 'rollback_paper') {
        if (!['completed', 'aborted', 'rollback'].includes(this.session.snapshot().state)) this.session.rollback(`control_room:${event.name}`, at);
      } else if (route.autoAction === 'abort_paper') {
        if (!['completed', 'aborted'].includes(this.session.snapshot().state)) this.session.abort(`control_room:${event.name}`, at);
      }
    }

    return route;
  }

  snapshot(): ControlRoomState {
    return {
      activeSessionId: this.session?.snapshot().sessionId ?? null,
      metrics: { ...this.metrics },
      lastRoute: this.lastRoute ? { ...this.lastRoute, runbook: this.lastRoute.runbook.map((step) => ({ ...step })) } : null,
      routeCount: this.routeCount,
      criticalRoutes: this.metrics.criticalAlerts,
    };
  }
}

export const CONTROL_ROOM_RUNBOOKS = RUNBOOKS;
export { classify as classifyControlRoomIncident };

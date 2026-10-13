import { createHash } from 'node:crypto';
import {
  canPassFastRisk,
  emitFastSignal,
  totalFastPathBudgetMs,
  type FastRiskSnapshot,
  type LatencyBudget,
  type MarketTick,
} from '../latency.ts';

export type FastPathEventType = 'market.tick' | 'signal.generated' | 'risk.checked' | 'paper.route';

export interface FastPathEvent<T = unknown> {
  id: string;
  type: FastPathEventType;
  sequence: number;
  ts: number;
  payload: T;
}

export interface FastPathExecutionProfile {
  latencyBudget: LatencyBudget;
  maxTickAgeMs: number;
  requirePaperSession: boolean;
  liveExecutionEnabled: false;
}

export interface FastPathDecision {
  accepted: boolean;
  reason: string;
  event: FastPathEvent;
  signalSide: 'buy' | 'sell' | 'flat';
  signalStrength: number;
  notional: number;
  estimatedBudgetMs: number;
  decisionHash: string;
}

export const DEFAULT_FAST_PATH_PROFILE: FastPathExecutionProfile = {
  latencyBudget: {
    observeMs: 2,
    featureMs: 2,
    signalMs: 2,
    riskMs: 1,
    routeMs: 3,
  },
  maxTickAgeMs: 250,
  requirePaperSession: true,
  liveExecutionEnabled: false,
};

function canonicalHash(input: unknown): string {
  return createHash('sha256').update(JSON.stringify(input)).digest('hex');
}

function eventId(type: FastPathEventType, sequence: number, ts: number, payload: unknown): string {
  return canonicalHash({ type, sequence, ts, payload });
}

export class DeterministicFastPath {
  private lastSequence = -1;
  private readonly seen = new Set<string>();
  private readonly profile: FastPathExecutionProfile;

  constructor(profile: FastPathExecutionProfile = DEFAULT_FAST_PATH_PROFILE) {
    this.profile = profile;
    if (profile.liveExecutionEnabled !== false) {
      throw new Error('fast_path_live_execution_must_remain_disabled');
    }
    if (profile.maxTickAgeMs <= 0) throw new Error('fast_path_invalid_tick_age');
  }

  profileSnapshot(): FastPathExecutionProfile {
    return structuredClone(this.profile);
  }

  processTick(input: {
    tick: MarketTick;
    notional: number;
    risk: FastRiskSnapshot;
    now?: number;
    paperSessionActive?: boolean;
  }): FastPathDecision {
    const now = input.now ?? Date.now();
    const tick = input.tick;
    const event: FastPathEvent<MarketTick> = {
      id: eventId('market.tick', tick.sequence, tick.exchangeTs, tick),
      type: 'market.tick',
      sequence: tick.sequence,
      ts: tick.exchangeTs,
      payload: tick,
    };

    if (this.seen.has(event.id)) {
      return this.decision(event, false, 'duplicate-event', 'flat', 0, input.notional);
    }
    this.seen.add(event.id);

    if (tick.sequence <= this.lastSequence) {
      return this.decision(event, false, 'out-of-order-sequence', 'flat', 0, input.notional);
    }
    this.lastSequence = tick.sequence;

    if (tick.venue.length === 0 || tick.symbol.length === 0) {
      return this.decision(event, false, 'invalid-market-identity', 'flat', 0, input.notional);
    }

    if (!Number.isFinite(input.notional) || input.notional <= 0) {
      return this.decision(event, false, 'invalid-notional', 'flat', 0, input.notional);
    }

    if (this.profile.requirePaperSession && !input.paperSessionActive) {
      return this.decision(event, false, 'paper-session-required', 'flat', 0, input.notional);
    }

    if (now - tick.exchangeTs > this.profile.maxTickAgeMs) {
      return this.decision(event, false, 'stale-market-data', 'flat', 0, input.notional);
    }

    const signal = emitFastSignal(tick, now);
    const riskPassed = canPassFastRisk(input.notional, signal, { ...input.risk, staleAfterMs: Math.min(input.risk.staleAfterMs, this.profile.maxTickAgeMs) }, tick, now);
    const reason = riskPassed ? 'accepted-for-paper-route' : 'risk-or-signal-veto';
    return this.decision(event, riskPassed, reason, signal.side, signal.strength, input.notional);
  }

  private decision(
    event: FastPathEvent,
    accepted: boolean,
    reason: string,
    signalSide: 'buy' | 'sell' | 'flat',
    signalStrength: number,
    notional: number,
  ): FastPathDecision {
    const estimatedBudgetMs = totalFastPathBudgetMs(this.profile.latencyBudget);
    const decisionHash = canonicalHash({
      event,
      accepted,
      reason,
      signalSide,
      signalStrength,
      notional,
      estimatedBudgetMs,
      liveExecutionEnabled: this.profile.liveExecutionEnabled,
    });
    return { accepted, reason, event, signalSide, signalStrength, notional, estimatedBudgetMs, decisionHash };
  }
}

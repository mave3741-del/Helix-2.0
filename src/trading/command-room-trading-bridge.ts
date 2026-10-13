import { createHash } from 'node:crypto';
import { buildPaperOrderIntent, type PaperOrderIntent, type TradeExecutionGateInput } from './execution/trade-execution-gate.ts';
import type { TradeCandidateDecision } from './trade-candidate-council.ts';

export interface OwnerCapitalEnvelope {
  envelopeId: string;
  ownerId: string;
  capital: number;
  maxDailyLossPct: number;
  maxOrderPct: number;
  maxPositionPct: number;
  startsAt: number;
  expiresAt: number;
  active: boolean;
  approvedAt: number;
}

export interface CommandTradeRequest {
  commandSessionId: string;
  ownerId: string;
  candidate: TradeCandidateDecision;
  execution: Omit<TradeExecutionGateInput, 'decision'>;
  now?: number;
}

export interface CommandTradeResult {
  accepted: boolean;
  reason: string[];
  envelope: OwnerCapitalEnvelope | null;
  intent: PaperOrderIntent | null;
  commandAuditHash: string | null;
}

export interface CommandRoomTradingBridgeState {
  envelope: OwnerCapitalEnvelope | null;
}

export class CommandRoomTradingBridge {
  private envelope: OwnerCapitalEnvelope | null = null;

  approveCapitalEnvelope(input: Omit<OwnerCapitalEnvelope, 'envelopeId' | 'active' | 'approvedAt'>, now = Date.now()): OwnerCapitalEnvelope {
    if (input.ownerId.trim() !== 'owner') throw new Error('command_room_owner_identity_required');
    if (!(input.capital > 0) || !Number.isFinite(input.capital)) throw new Error('owner_capital_must_be_positive');
    if (!(input.expiresAt > input.startsAt)) throw new Error('capital_envelope_expiry_invalid');
    if (input.startsAt > now || input.expiresAt <= now) throw new Error('capital_envelope_not_active_now');
    if (input.maxDailyLossPct < 0 || input.maxDailyLossPct > 1) throw new Error('max_daily_loss_pct_invalid');
    if (input.maxOrderPct <= 0 || input.maxOrderPct > 1) throw new Error('max_order_pct_invalid');
    if (input.maxPositionPct <= 0 || input.maxPositionPct > 1) throw new Error('max_position_pct_invalid');
    const envelopeId = `env:${now}:${createHash('sha256').update(JSON.stringify(input)).digest('hex').slice(0, 16)}`;
    this.envelope = { ...input, envelopeId, active: true, approvedAt: now };
    return structuredClone(this.envelope);
  }

  revokeCapitalEnvelope(): void {
    if (this.envelope) this.envelope.active = false;
  }

  getState(now = Date.now()): CommandRoomTradingBridgeState {
    if (this.envelope && this.envelope.expiresAt <= now) this.envelope.active = false;
    return { envelope: this.envelope ? structuredClone(this.envelope) : null };
  }

  requestPaperTrade(input: CommandTradeRequest): CommandTradeResult {
    const now = input.now ?? Date.now();
    const state = this.getState(now);
    const envelope = state.envelope;
    const reasons: string[] = [];
    if (input.ownerId.trim() !== 'owner') reasons.push('command_room_owner_identity_required');
    if (envelope && input.ownerId.trim() !== envelope.ownerId) reasons.push('command_room_owner_envelope_mismatch');
    if (!envelope?.active) reasons.push('owner_capital_envelope_missing_or_inactive');
    if (envelope && (now < envelope.startsAt || now >= envelope.expiresAt)) reasons.push('owner_capital_envelope_outside_window');
    if (envelope && input.execution.equity > envelope.capital) reasons.push('execution_equity_exceeds_owner_capital_envelope');
    if (reasons.length) return { accepted: false, reason: [...new Set(reasons)], envelope, intent: null, commandAuditHash: null };

    const gate = buildPaperOrderIntent({
      ...input.execution,
      decision: input.candidate,
      risk: {
        ...input.execution.risk,
        capital: envelope!.capital,
        maxDailyLossPct: envelope!.maxDailyLossPct,
        maxOrderPct: Math.min(input.execution.risk.maxOrderPct, envelope!.maxOrderPct),
        maxPositionPct: Math.min(input.execution.risk.maxPositionPct, envelope!.maxPositionPct),
      },
    }, now);
    if (!gate.approved || !gate.intent) {
      return { accepted: false, reason: gate.reasons, envelope, intent: null, commandAuditHash: null };
    }
    const payload = {
      commandSessionId: input.commandSessionId,
      ownerId: input.ownerId,
      envelopeId: envelope!.envelopeId,
      candidateSubjectId: input.candidate.subjectId,
      intent: gate.intent,
      timestamp: now,
    };
    const commandAuditHash = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
    return { accepted: true, reason: [], envelope, intent: gate.intent, commandAuditHash };
  }
}

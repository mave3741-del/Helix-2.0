import test from 'node:test';
import assert from 'node:assert/strict';
import { CommandRoomTradingBridge } from './command-room-trading-bridge.ts';
import type { TradeCandidateDecision } from './trade-candidate-council.ts';

function candidate(): TradeCandidateDecision {
  return {
    subjectId: 'cand-1', symbol: 'BTC/USD', market: 'crypto', venue: 'paper', action: 'buy', confidence: 0.8,
    rationale: ['evidence'], evidenceIds: ['ev-1'], participantIds: ['W-0001'], councilIds: ['crypto'],
    eligibleForRiskReview: true, riskVetoed: false,
  } as TradeCandidateDecision;
}

test('command room bridge uses an owner capital envelope rather than per-trade approval', () => {
  const bridge = new CommandRoomTradingBridge();
  const now = 1_700_000_000_000;
  bridge.approveCapitalEnvelope({ ownerId: 'owner', capital: 10_000, maxDailyLossPct: 0.05, maxOrderPct: 0.1, maxPositionPct: 0.25, startsAt: now - 1_000, expiresAt: now + 86_400_000 }, now);
  const result = bridge.requestPaperTrade({
    commandSessionId: 'room-1', ownerId: 'owner', candidate: candidate(), now,
    execution: { price: 100, equity: 10_000, risk: { capital: 10_000, maxPositionPct: 0.25, maxOrderPct: 0.1, maxDailyLossPct: 0.05, maxDrawdownPct: 0.2, maxLeverage: 2 }, market: 'crypto', sector: 'crypto' },
  });
  assert.equal(result.accepted, true);
  assert.ok(result.intent?.clientOrderId);
  assert.ok(result.commandAuditHash);
});

test('command room bridge fails closed without owner capital envelope', () => {
  const bridge = new CommandRoomTradingBridge();
  const result = bridge.requestPaperTrade({
    commandSessionId: 'room-1', ownerId: 'owner', candidate: candidate(), now: 1_700_000_000_000,
    execution: { price: 100, equity: 10_000, risk: { capital: 10_000, maxPositionPct: 0.25, maxOrderPct: 0.1, maxDailyLossPct: 0.05, maxDrawdownPct: 0.2, maxLeverage: 2 }, market: 'crypto', sector: 'crypto' },
  });
  assert.equal(result.accepted, false);
  assert.deepEqual(result.reason, ['owner_capital_envelope_missing_or_inactive']);
});

test('command room cannot spend another owner identity envelope', () => {
  const bridge = new CommandRoomTradingBridge();
  const now = 1_700_000_000_000;
  bridge.approveCapitalEnvelope({ ownerId: 'owner', capital: 10_000, maxDailyLossPct: 0.05, maxOrderPct: 0.1, maxPositionPct: 0.25, startsAt: now - 1_000, expiresAt: now + 86_400_000 }, now);
  const result = bridge.requestPaperTrade({
    commandSessionId: 'room-1', ownerId: 'attacker', candidate: candidate(), now,
    execution: { price: 100, equity: 10_000, risk: { capital: 10_000, maxPositionPct: 0.25, maxOrderPct: 0.1, maxDailyLossPct: 0.05, maxDrawdownPct: 0.2, maxLeverage: 2 }, market: 'crypto', sector: 'crypto' },
  });
  assert.equal(result.accepted, false);
  assert.ok(result.reason.includes('command_room_owner_identity_required'));
  assert.ok(result.reason.includes('command_room_owner_envelope_mismatch'));
});

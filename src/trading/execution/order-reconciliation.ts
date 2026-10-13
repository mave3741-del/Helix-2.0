import { createHash } from 'node:crypto';
import type { BrokerOrder, BrokerPosition } from './broker-connectors.ts';

export type ReconciliationStatus = 'reconciled' | 'drift' | 'halted';

export interface DesiredOrderState {
  clientOrderId: string;
  symbol: string;
  side: 'buy' | 'sell';
  qty: number;
  status: 'open' | 'canceled' | 'filled';
}

export interface PositionExpectation {
  symbol: string;
  qty: number;
}

export interface ReconciliationInput {
  observedOrders: BrokerOrder[];
  desiredOrders: DesiredOrderState[];
  observedPositions: BrokerPosition[];
  expectedPositions?: PositionExpectation[];
}

export interface ReconciliationDiff {
  missingOrders: string[];
  unexpectedOrders: string[];
  statusMismatches: string[];
  quantityMismatches: string[];
  positionMismatches: string[];
}

export interface ReconciliationResult {
  status: ReconciliationStatus;
  reasons: string[];
  diff: ReconciliationDiff;
  reconciliationHash: string;
}

function hash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export function reconcileBrokerState(input: ReconciliationInput): ReconciliationResult {
  const observedByClient = new Map(input.observedOrders.map((order) => [order.clientOrderId, order]));
  const desiredByClient = new Map(input.desiredOrders.map((order) => [order.clientOrderId, order]));
  const missingOrders: string[] = [];
  const unexpectedOrders: string[] = [];
  const statusMismatches: string[] = [];
  const quantityMismatches: string[] = [];

  for (const desired of input.desiredOrders) {
    const observed = observedByClient.get(desired.clientOrderId);
    if (!observed) {
      if (desired.status === 'open') missingOrders.push(desired.clientOrderId);
      continue;
    }
    const desiredOpen = desired.status === 'open';
    const observedOpen = ['new', 'accepted', 'partially_filled'].includes(observed.status);
    if (desiredOpen !== observedOpen && desired.status !== 'filled') statusMismatches.push(desired.clientOrderId);
    if (observed.symbol !== desired.symbol || observed.side !== desired.side) statusMismatches.push(`${desired.clientOrderId}:identity`);
    if (desired.qty > 0 && observed.filledQty > desired.qty) quantityMismatches.push(desired.clientOrderId);
  }

  for (const observed of input.observedOrders) {
    if (!desiredByClient.has(observed.clientOrderId) && ['new', 'accepted', 'partially_filled'].includes(observed.status)) {
      unexpectedOrders.push(observed.clientOrderId);
    }
  }

  const expectedPositions = new Map((input.expectedPositions ?? []).map((position) => [position.symbol, position.qty]));
  const observedPositions = new Map(input.observedPositions.map((position) => [position.symbol, position.qty]));
  const positionMismatches: string[] = [];
  for (const [symbol, expectedQty] of expectedPositions) {
    const actualQty = observedPositions.get(symbol) ?? 0;
    if (Math.abs(actualQty - expectedQty) > 1e-9) positionMismatches.push(`${symbol}:${expectedQty}->${actualQty}`);
  }
  for (const [symbol, actualQty] of observedPositions) {
    if (!expectedPositions.has(symbol) && Math.abs(actualQty) > 1e-9) positionMismatches.push(`${symbol}:0->${actualQty}`);
  }

  const diff = {
    missingOrders: [...new Set(missingOrders)].sort(),
    unexpectedOrders: [...new Set(unexpectedOrders)].sort(),
    statusMismatches: [...new Set(statusMismatches)].sort(),
    quantityMismatches: [...new Set(quantityMismatches)].sort(),
    positionMismatches: [...new Set(positionMismatches)].sort(),
  } satisfies ReconciliationDiff;
  const reasons = [
    ...(diff.missingOrders.length ? ['missing_open_order'] : []),
    ...(diff.unexpectedOrders.length ? ['unexpected_open_order'] : []),
    ...(diff.statusMismatches.length ? ['order_status_or_identity_mismatch'] : []),
    ...(diff.quantityMismatches.length ? ['order_quantity_mismatch'] : []),
    ...(diff.positionMismatches.length ? ['position_mismatch'] : []),
  ];
  const status: ReconciliationStatus = reasons.length === 0 ? 'reconciled' : 'drift';
  return { status, reasons, diff, reconciliationHash: hash({ status, reasons, diff }) };
}

export function failClosedOnReconciliation(result: ReconciliationResult): boolean {
  return result.status === 'reconciled';
}

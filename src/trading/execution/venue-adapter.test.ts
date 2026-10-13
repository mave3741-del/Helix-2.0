import assert from 'node:assert/strict';
import test from 'node:test';
import type { BrokerOrderRequest } from './broker-connectors.ts';
import {
  assessVenueAdapter,
  approveVenueAdapter,
  canEnterVenuePaperPath,
  createBrokerBackedPaperVenueAdapter,
  createVenueAdapterRecord,
  deployVenueAdapter,
} from './venue-adapter.ts';

const evidence = {
  licenseReviewed: true,
  dataRightsReviewed: true,
  securityReviewed: true,
  testsVerified: true,
  latencyReviewed: true,
  provenanceVerified: true,
  reproducibilityVerified: true,
  credentialIsolationVerified: true,
  endpointAllowlistVerified: true,
  normalizationVerified: true,
  replaySafetyVerified: true,
  killSwitchVerified: true,
};

const capabilities = {
  marketData: true,
  orderEntry: true,
  account: true,
  positions: true,
  orderCancellation: true,
  websocket: true,
  rest: true,
  assetClasses: ['crypto'] as const,
};

test('venue adapter is paper-only by construction', () => {
  assert.throws(() => createVenueAdapterRecord({
    venueId: 'example-crypto',
    adapterVersion: '1.0.0',
    capability: 'crypto-market-connectivity',
    implementationKind: 'adapter',
    executionModes: ['live'],
    liveExecutionEnabled: true,
    capabilities,
    provenance: 'helix-review',
  }), /live_execution/);
});

test('venue adapter fails closed until security and market controls are evidenced', () => {
  const record = createVenueAdapterRecord({
    venueId: 'example-crypto',
    adapterVersion: '1.0.0',
    capability: 'crypto-market-connectivity',
    implementationKind: 'adapter',
    capabilities,
    provenance: 'helix-review',
  });
  assert.throws(() => assessVenueAdapter(record), /license_review_required/);
});

test('complete venue evidence admits a paper-only adapter', () => {
  const record = createVenueAdapterRecord({
    venueId: 'example-crypto',
    adapterVersion: '1.0.0',
    capability: 'crypto-market-connectivity',
    implementationKind: 'adapter',
    sourceRepository: 'venue/adapter',
    sourceVersion: '1.0.0',
    capabilities,
    provenance: 'helix-review',
    evidence,
  });
  const deployed = deployVenueAdapter(approveVenueAdapter(assessVenueAdapter(record)));
  assert.equal(deployed.status, 'deployed');
  assert.equal(deployed.executionModes[0], 'paper');
  assert.equal(deployed.liveExecutionEnabled, false);
  assert.equal(canEnterVenuePaperPath(deployed), true);
});

test('paper admission cannot be created without a supported asset class', () => {
  assert.throws(() => createVenueAdapterRecord({
    venueId: 'bad-venue',
    adapterVersion: '1.0.0',
    capability: 'market-connectivity',
    implementationKind: 'native',
    capabilities: { ...capabilities, assetClasses: [] },
    provenance: 'helix-review',
  }), /venue_asset_class_required/);
});


test('paper venue bridge refuses a non-paper connector', () => {
  const record = createVenueAdapterRecord({
    venueId: 'example-crypto',
    adapterVersion: '1.0.0',
    capability: 'crypto-market-connectivity',
    implementationKind: 'adapter',
    capabilities,
    provenance: 'helix-review',
    evidence,
  });
  const deployed = deployVenueAdapter(approveVenueAdapter(assessVenueAdapter(record)));
  const liveishConnector = {
    id: 'unsafe', mode: 'live',
    account: async () => ({ id: 'a', currency: 'USD', status: 'active', buyingPower: 0, cash: 0, portfolioValue: 0, equity: 0 }),
    markets: async () => [], positions: async () => [], orders: async () => [],
    placeOrder: async () => { throw new Error('not_implemented'); }, cancelOrder: async () => {},
  } as const;
  assert.throws(() => createBrokerBackedPaperVenueAdapter(deployed, liveishConnector), /paper_connector_required/);
});

test('paper venue bridge can bind an admitted paper connector', async () => {
  const record = createVenueAdapterRecord({
    venueId: 'example-crypto',
    adapterVersion: '1.0.0',
    capability: 'crypto-market-connectivity',
    implementationKind: 'adapter',
    capabilities,
    provenance: 'helix-review',
    evidence,
  });
  const deployed = deployVenueAdapter(approveVenueAdapter(assessVenueAdapter(record)));
  const paperConnector = {
    id: 'paper', mode: 'paper',
    account: async () => ({ id: 'a', currency: 'USD', status: 'active', buyingPower: 1000, cash: 1000, portfolioValue: 1000, equity: 1000 }),
    markets: async () => [{ symbol: 'BTC/USD', assetClass: 'crypto' as const, tradable: true }],
    positions: async () => [], orders: async () => [],
    placeOrder: async (order: BrokerOrderRequest) => ({ id: 'o1', clientOrderId: order.clientOrderId, symbol: order.symbol, side: order.side, type: order.type ?? 'market', qty: order.qty ?? 0, filledQty: 0, status: 'accepted' as const }),
    cancelOrder: async () => {},
  } as const;
  const adapter = createBrokerBackedPaperVenueAdapter(deployed, paperConnector);
  assert.equal((await adapter.markets({ symbols: ['BTC/USD'] }))[0]?.symbol, 'BTC/USD');
  assert.equal((await adapter.placePaperOrder?.({ clientOrderId: 'c1', symbol: 'BTC/USD', side: 'buy', qty: 1 }))?.status, 'accepted');
});

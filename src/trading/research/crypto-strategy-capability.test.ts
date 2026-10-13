import assert from 'node:assert/strict';
import test from 'node:test';
import {
  approveCryptoStrategyCapability,
  assessCryptoStrategyCapability,
  canRunCryptoPaperStrategy,
  createCryptoStrategyCapabilityRecord,
  deployCryptoStrategyCapability,
} from './crypto-strategy-capability.ts';
import {
  approveVenueAdapter,
  assessVenueAdapter,
  createVenueAdapterRecord,
  deployVenueAdapter,
} from '../execution/venue-adapter.ts';

const venueEvidence = {
  licenseReviewed: true, dataRightsReviewed: true, securityReviewed: true, testsVerified: true,
  latencyReviewed: true, provenanceVerified: true, reproducibilityVerified: true,
  credentialIsolationVerified: true, endpointAllowlistVerified: true, normalizationVerified: true,
  replaySafetyVerified: true, killSwitchVerified: true,
};

const strategyEvidence = {
  licenseReviewed: true, dataRightsReviewed: true, securityReviewed: true, testsVerified: true,
  latencyReviewed: true, provenanceVerified: true, reproducibilityVerified: true,
  venueAdmissionVerified: true, paperExecutionVerified: true, costModelVerified: true,
  slippageModelVerified: true, walkForwardVerified: true, overfitControlsVerified: true,
};

function admittedVenue() {
  return deployVenueAdapter(approveVenueAdapter(assessVenueAdapter(createVenueAdapterRecord({
    venueId: 'crypto-paper',
    adapterVersion: '1.0.0',
    capability: 'crypto-connectivity',
    implementationKind: 'adapter',
    capabilities: {
      marketData: true, orderEntry: true, account: true, positions: true,
      orderCancellation: true, websocket: true, rest: true, assetClasses: ['crypto'],
    },
    evidence: venueEvidence,
    provenance: 'helix-venue-review',
  }))));
}

test('crypto strategy is paper-only and rejects live-admitted venues', () => {
  const venue = { ...admittedVenue(), executionModes: ['live'] as const, liveExecutionEnabled: false };
  assert.throws(() => createCryptoStrategyCapabilityRecord({
    strategyId: 'mm-001', strategyKind: 'market-making', venueAdapters: [venue], symbols: ['BTC/USD'],
    maxNotionalPerPosition: 1000, maxDailyLoss: 100, evidence: strategyEvidence, provenance: 'helix',
  }), /paper_only_venue_admission_required/);
});

test('strategy fails closed until evidence is complete', () => {
  const venue = admittedVenue();
  const record = createCryptoStrategyCapabilityRecord({
    strategyId: 'trend-001', strategyKind: 'trend', venueAdapters: [venue], symbols: ['BTC/USD'],
    maxNotionalPerPosition: 1000, maxDailyLoss: 100, provenance: 'helix',
  });
  assert.throws(() => assessCryptoStrategyCapability(record, [venue]), /license_review_required/);
});

test('admitted crypto strategy can enter paper path', () => {
  const venue = admittedVenue();
  const record = createCryptoStrategyCapabilityRecord({
    strategyId: 'arb-001', strategyKind: 'arbitrage', researchMode: 'paper', optimizationMode: 'bounded-grid',
    venueAdapters: [venue], symbols: ['BTC/USD', 'ETH/USD'],
    parameterBounds: [{ name: 'spreadBps', min: 2, max: 20, step: 2 }],
    maxConcurrentPositions: 2, maxNotionalPerPosition: 1000, maxDailyLoss: 100,
    evidence: strategyEvidence, provenance: 'helix-hummingbot-pattern-review',
  });
  const deployed = deployCryptoStrategyCapability(approveCryptoStrategyCapability(assessCryptoStrategyCapability(record, [venue])));
  assert.equal(deployed.status, 'deployed');
  assert.equal(deployed.liveExecutionEnabled, false);
  assert.equal(canRunCryptoPaperStrategy(deployed), true);
});

test('strategy bounds are deterministic and invalid bounds fail closed', () => {
  const venue = admittedVenue();
  assert.throws(() => createCryptoStrategyCapabilityRecord({
    strategyId: 'bad-bounds', strategyKind: 'mean-reversion', venueAdapters: [venue], symbols: ['ETH/USD'],
    parameterBounds: [{ name: 'lookback', min: 20, max: 10, step: 1 }],
    maxNotionalPerPosition: 1000, maxDailyLoss: 100, evidence: strategyEvidence, provenance: 'helix',
  }), /invalid_parameter_bounds/);
});

test('strategy requires an admitted venue at assessment time', () => {
  const venue = admittedVenue();
  const record = createCryptoStrategyCapabilityRecord({
    strategyId: 'venue-gap', strategyKind: 'trend', venueAdapters: [venue], symbols: ['BTC/USD'],
    maxNotionalPerPosition: 1000, maxDailyLoss: 100, evidence: strategyEvidence, provenance: 'helix',
  });
  assert.throws(() => assessCryptoStrategyCapability(record, []), /venue_admission_required/);
});

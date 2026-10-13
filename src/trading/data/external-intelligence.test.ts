import assert from 'node:assert/strict';
import test from 'node:test';
import { assertAdapterAdmitted, buildDuplicateKey, classifySentiment, createExternalIntelligenceEvidence, externalIntelligenceHash, governExternalIntelligence } from './external-intelligence.ts';

test('classifies bounded sentiment deterministically', () => {
  assert.equal(classifySentiment(-0.9), 'very-negative');
  assert.equal(classifySentiment(-0.3), 'negative');
  assert.equal(classifySentiment(0), 'neutral');
  assert.equal(classifySentiment(0.3), 'positive');
  assert.equal(classifySentiment(0.9), 'very-positive');
});

test('rejects point-in-time future leakage', () => {
  assert.throws(() => createExternalIntelligenceEvidence({
    sourceId: 'x.api', sourceType: 'social', subjectId: 'BTC', eventTs: 2000, publishedTs: 2000,
    availableTs: 3000, retrievedTs: 3000, credibilityScore: 0.7, provenance: { postId: '1' },
  }, 2500), /point_in_time_invalid/);
});

test('deduplicates identical evidence and forbids trade directives', () => {
  const base = createExternalIntelligenceEvidence({
    sourceId: 'reddit.api', sourceType: 'social', subjectId: 'BTC', canonicalUrl: 'https://reddit.example/1',
    title: 'BTC', text: 'positive', eventTs: 1000, publishedTs: 1000, availableTs: 1100, retrievedTs: 1100,
    sentimentScore: 0.5, credibilityScore: 0.6, manipulationRisk: 0.2, provenance: { postId: '1' },
  }, 1200);
  const clone = { ...base };
  const result = governExternalIntelligence({ source: 'reddit.api', sourceType: 'social', asOfTs: 1200, observations: [base, clone], rejected: [] });
  assert.equal(result.accepted.length, 1);
  assert.equal(result.duplicates.length, 1);
  assert.equal(result.tradeDirectiveAllowed, false);
  assert.ok(result.corroboration > 0);
});

test('duplicate keys and hashes are deterministic', () => {
  const input = { sourceId: 'sec.edgar', subjectId: 'AAPL', eventTs: 10, canonicalUrl: 'u', title: 't', text: 'x' };
  assert.equal(buildDuplicateKey(input), buildDuplicateKey(input));
  const hash = externalIntelligenceHash({ source: 'sec.edgar', sourceType: 'filing', asOfTs: 10, observations: [], rejected: [] });
  assert.equal(hash.length, 64);
});

test('governed source admission binds adapter and official endpoint', () => {
  assert.doesNotThrow(() => assertAdapterAdmitted('sec.edgar', 'sec.edgar.submissions', 'https://data.sec.gov/submissions'));
  assert.throws(() => assertAdapterAdmitted('sec.edgar', 'sec.edgar.submissions', 'https://evil.example'), /external_source_host_not_admitted/);
  assert.throws(() => assertAdapterAdmitted('sec.edgar', 'unregistered.adapter'), /external_adapter_not_admitted/);
});

test('unknown external source cannot create evidence', () => {
  assert.throws(() => createExternalIntelligenceEvidence({
    sourceId: 'unregistered.source', sourceType: 'news', subjectId: 'AAPL', eventTs: 1000, availableTs: 1000, retrievedTs: 1000,
    credibilityScore: 0.5, provenance: {},
  }, 1000), /external_source_not_governed/);
});

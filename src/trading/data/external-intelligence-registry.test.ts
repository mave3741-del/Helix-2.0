import assert from 'node:assert/strict';
import test from 'node:test';
import { createExternalIntelligenceEvidence } from './external-intelligence.ts';
import { InMemoryExternalIntelligenceStore } from './external-intelligence-store.ts';
import { ExternalIntelligenceRegistry } from './external-intelligence-registry.ts';

test('registry persists only governed unique evidence', async () => {
  const evidence = createExternalIntelligenceEvidence({
    sourceId: 'x.api', sourceType: 'social', subjectId: 'BTC', eventTs: 1000, publishedTs: 1000,
    availableTs: 1100, retrievedTs: 1100, credibilityScore: 0.8, provenance: { postId: 'p1' },
  }, 1200);
  const registry = new ExternalIntelligenceRegistry(new InMemoryExternalIntelligenceStore());
  const result = await registry.ingest({ source: 'x.api', sourceType: 'social', asOfTs: 1200, observations: [evidence, { ...evidence }], rejected: [] });
  assert.equal(result.inserted, 1);
  assert.equal(result.duplicate, 1);
  assert.equal(result.tradeDirectiveAllowed, false);
});

test('unknown source cannot enter registry', async () => {
  const registry = new ExternalIntelligenceRegistry(new InMemoryExternalIntelligenceStore());
  await assert.rejects(() => registry.ingest({ source: 'unknown', sourceType: 'news', asOfTs: 1, observations: [], rejected: [] }), /external_source_not_governed/);
});

test('registry rejects source/type spoofing and forged duplicate keys', async () => {
  const registry = new ExternalIntelligenceRegistry(new InMemoryExternalIntelligenceStore());
  const evidence = createExternalIntelligenceEvidence({
    sourceId: 'x.api', sourceType: 'social', subjectId: 'BTC', eventTs: 1000, publishedTs: 1000,
    availableTs: 1100, retrievedTs: 1100, credibilityScore: 0.8, provenance: { postId: 'p2' },
  }, 1200);
  await assert.rejects(() => registry.ingest({ source: 'reddit.api', sourceType: 'social', asOfTs: 1200, observations: [evidence], rejected: [] }), /external_observation_source_mismatch/);
  await assert.rejects(() => registry.ingest({ source: 'x.api', sourceType: 'social', asOfTs: 1200, observations: [{ ...evidence, duplicateKey: 'forged' }], rejected: [] }), /external_duplicate_key_mismatch/);
});

test('adapter admission binds source, adapter and official endpoint', async () => {
  const registry = new ExternalIntelligenceRegistry(new InMemoryExternalIntelligenceStore());
  const evidence = createExternalIntelligenceEvidence({
    sourceId: 'sec.edgar', sourceType: 'filing', subjectId: 'CIK0000000001', eventTs: 1000, publishedTs: 1000,
    availableTs: 1100, retrievedTs: 1100, credibilityScore: 1, provenance: { adapterId: 'sec.edgar.submissions' },
  }, 1200);
  const ok = await registry.ingest({ source: 'sec.edgar', sourceType: 'filing', adapterId: 'sec.edgar.submissions', endpoint: 'https://data.sec.gov/submissions', asOfTs: 1200, observations: [evidence], rejected: [] });
  assert.equal(ok.inserted, 1);
  await assert.rejects(() => registry.ingest({ source: 'sec.edgar', sourceType: 'filing', adapterId: 'sec.edgar.submissions', endpoint: 'https://example.com', asOfTs: 1200, observations: [], rejected: [] }), /external_source_host_not_admitted/);
});

import { assertGovernedExternalSource, governExternalIntelligence, type ExternalIntelligenceBatch, type ExternalIntelligenceEvidence } from './external-intelligence.ts';
import type { ExternalIntelligenceStore } from './external-intelligence-store.ts';

export class ExternalIntelligenceRegistry {
  private readonly store: ExternalIntelligenceStore;
  constructor(store: ExternalIntelligenceStore) { this.store = store; }

  async ingest(batch: ExternalIntelligenceBatch) {
    assertGovernedExternalSource(batch.source);
    const governed = governExternalIntelligence(batch);
    const persisted: ExternalIntelligenceEvidence[] = [];
    let inserted = 0;
    let duplicate = governed.duplicates.length;
    for (const evidence of governed.accepted) {
      const result = await this.store.append(evidence);
      if (result.inserted) { inserted += 1; persisted.push(result.evidence); }
      else duplicate += 1;
    }
    return { ...governed, persisted, inserted, duplicate };
  }
}

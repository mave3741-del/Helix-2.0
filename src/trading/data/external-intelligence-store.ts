import { createHash } from 'node:crypto';
import { buildDuplicateKey, type ExternalIntelligenceEvidence } from './external-intelligence.ts';

export interface ExternalIntelligenceStore {
  append(evidence: ExternalIntelligenceEvidence): Promise<{ inserted: boolean; evidence: ExternalIntelligenceEvidence }>;
  get(evidenceId: string): Promise<ExternalIntelligenceEvidence | null>;
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${stableJson(object[key])}`).join(',')}}`;
}

export function externalEvidenceHash(evidence: ExternalIntelligenceEvidence): string {
  return createHash('sha256').update(stableJson(evidence), 'utf8').digest('hex');
}

export class InMemoryExternalIntelligenceStore implements ExternalIntelligenceStore {
  private readonly rows = new Map<string, ExternalIntelligenceEvidence>();
  async append(evidence: ExternalIntelligenceEvidence) {
    if (evidence.duplicateKey !== buildDuplicateKey(evidence)) throw new Error('external_duplicate_key_mismatch');
    const existing = this.rows.get(evidence.duplicateKey);
    if (existing) return { inserted: false, evidence: { ...existing } };
    const stored = { ...evidence };
    this.rows.set(evidence.duplicateKey, stored);
    return { inserted: true, evidence: { ...stored } };
  }
  async get(evidenceId: string) {
    for (const row of this.rows.values()) {
      if (externalEvidenceHash(row) === evidenceId || row.duplicateKey === evidenceId) return { ...row };
    }
    return null;
  }
}

interface SqlLike { query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>; }

export class SqlExternalIntelligenceStore implements ExternalIntelligenceStore {
  private readonly sql: SqlLike;
  constructor(sql: SqlLike) { this.sql = sql; }

  async append(evidence: ExternalIntelligenceEvidence) {
    if (evidence.duplicateKey !== buildDuplicateKey(evidence)) throw new Error('external_duplicate_key_mismatch');
    const evidenceId = externalEvidenceHash(evidence);
    const rows = await this.sql.query<Record<string, unknown>>(
      `INSERT INTO external_intelligence_registry
       (evidence_id, source_id, source_type, subject_id, canonical_url, title, text, event_ts, published_ts, available_ts, retrieved_ts,
        symbols, entities, sentiment_score, sentiment_label, credibility_score, manipulation_risk, duplicate_key, provenance, evidence_hash)
       VALUES ($1,$2,$3,$4,$5,$6,$7,to_timestamp($8/1000.0),to_timestamp($9/1000.0),to_timestamp($10/1000.0),to_timestamp($11/1000.0),
        $12::jsonb,$13::jsonb,$14,$15,$16,$17,$18,$19::jsonb,$20)
       ON CONFLICT (duplicate_key) DO NOTHING
       RETURNING *`,
      [evidenceId, evidence.sourceId, evidence.sourceType, evidence.subjectId, evidence.canonicalUrl ?? null, evidence.title ?? null, evidence.text ?? null,
       evidence.eventTs, evidence.publishedTs ?? null, evidence.availableTs, evidence.retrievedTs, JSON.stringify(evidence.symbols ?? []), JSON.stringify(evidence.entities ?? []),
       evidence.sentimentScore ?? null, evidence.sentimentLabel ?? null, evidence.credibilityScore, evidence.manipulationRisk, evidence.duplicateKey, JSON.stringify(evidence.provenance), evidenceId],
    );
    if (!rows[0]) return { inserted: false, evidence };
    return { inserted: true, evidence };
  }

  async get(evidenceId: string) {
    const rows = await this.sql.query<Record<string, unknown>>(`SELECT * FROM external_intelligence_registry WHERE evidence_id = $1 OR duplicate_key = $1 LIMIT 1`, [evidenceId]);
    const row = rows[0];
    if (!row) return null;
    const parse = (v: unknown) => typeof v === 'string' ? JSON.parse(v) : v;
    const evidence = {
      sourceId: String(row.source_id), sourceType: String(row.source_type) as ExternalIntelligenceEvidence['sourceType'], subjectId: String(row.subject_id),
      canonicalUrl: row.canonical_url == null ? undefined : String(row.canonical_url), title: row.title == null ? undefined : String(row.title), text: row.text == null ? undefined : String(row.text),
      eventTs: new Date(String(row.event_ts)).getTime(), publishedTs: row.published_ts == null ? undefined : new Date(String(row.published_ts)).getTime(),
      availableTs: new Date(String(row.available_ts)).getTime(), retrievedTs: new Date(String(row.retrieved_ts)).getTime(),
      symbols: parse(row.symbols) as string[], entities: parse(row.entities) as string[], sentimentScore: row.sentiment_score == null ? undefined : Number(row.sentiment_score),
      sentimentLabel: row.sentiment_label == null ? undefined : String(row.sentiment_label) as ExternalIntelligenceEvidence['sentimentLabel'], credibilityScore: Number(row.credibility_score),
      manipulationRisk: Number(row.manipulation_risk), duplicateKey: String(row.duplicate_key), provenance: parse(row.provenance) as Record<string, unknown>,
    } as ExternalIntelligenceEvidence;
    const persistedHash = String(row.evidence_hash);
    if (persistedHash !== externalEvidenceHash(evidence)) throw new Error('external_evidence_hash_mismatch');
    return evidence;
  }
}

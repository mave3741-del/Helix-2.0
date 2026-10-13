import { createHash } from "node:crypto";

export type CapabilityTreatment =
  | "reference"
  | "adapter"
  | "optional-component"
  | "reimplement"
  | "core-component";

export type IntegrationStatus =
  | "proposed"
  | "assessed"
  | "approved"
  | "deployed"
  | "rejected"
  | "retired";

export interface CapabilityEvidence {
  licenseReviewed: boolean;
  dataRightsReviewed: boolean;
  securityReviewed: boolean;
  testsVerified: boolean;
  latencyReviewed: boolean;
  provenanceVerified: boolean;
  reproducibilityVerified: boolean;
}

export interface CapabilityIntegrationRecord {
  id: string;
  benchmarkId: string;
  sourceRepository: string;
  sourceVersion: string;
  capability: string;
  treatment: CapabilityTreatment;
  componentName: string;
  status: IntegrationStatus;
  coreDependencyAllowed: boolean;
  evidence: CapabilityEvidence;
  provenance: string;
  implementationHash: string;
  evidenceHash: string;
  updatedAt: number;
}

const STATUS_ORDER: IntegrationStatus[] = ["proposed", "assessed", "approved", "deployed", "retired"];

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${stableJson(object[key])}`).join(",")}}`;
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function allEvidencePassed(evidence: CapabilityEvidence): boolean {
  return Object.values(evidence).every(Boolean);
}

export function capabilityEvidenceHash(evidence: CapabilityEvidence): string {
  return sha256(stableJson(evidence));
}

export function capabilityIntegrationHash(record: Omit<CapabilityIntegrationRecord, "updatedAt" | "evidenceHash" | "implementationHash">): string {
  return sha256(stableJson(record));
}

export function createCapabilityIntegrationRecord(input: {
  benchmarkId: string;
  sourceRepository: string;
  sourceVersion: string;
  capability: string;
  treatment: CapabilityTreatment;
  componentName: string;
  coreDependencyAllowed?: boolean;
  evidence?: Partial<CapabilityEvidence>;
  provenance: string;
  implementationHash?: string;
}): CapabilityIntegrationRecord {
  if (!input.benchmarkId.trim()) throw new Error("benchmark_id_required");
  if (!input.sourceRepository.trim()) throw new Error("source_repository_required");
  if (!input.sourceVersion.trim()) throw new Error("source_version_required");
  if (!input.capability.trim()) throw new Error("capability_required");
  if (!input.componentName.trim()) throw new Error("component_name_required");
  if (!input.provenance.trim()) throw new Error("provenance_required");

  const evidence: CapabilityEvidence = {
    licenseReviewed: false,
    dataRightsReviewed: false,
    securityReviewed: false,
    testsVerified: false,
    latencyReviewed: false,
    provenanceVerified: false,
    reproducibilityVerified: false,
    ...input.evidence,
  };

  if (input.treatment === "reference" || input.treatment === "reimplement") {
    if (input.coreDependencyAllowed === true) throw new Error("reference_or_reimplementation_cannot_default_to_core_dependency");
  }

  const base = {
    id: `${input.benchmarkId}:${input.componentName}`,
    benchmarkId: input.benchmarkId,
    sourceRepository: input.sourceRepository,
    sourceVersion: input.sourceVersion,
    capability: input.capability,
    treatment: input.treatment,
    componentName: input.componentName,
    status: "proposed" as const,
    coreDependencyAllowed: input.coreDependencyAllowed ?? false,
    evidence,
    provenance: input.provenance,
  };
  return {
    ...base,
    implementationHash: input.implementationHash ?? sha256(stableJson(base)),
    evidenceHash: capabilityEvidenceHash(evidence),
    updatedAt: Date.now(),
  };
}

export function assessCapabilityIntegration(record: CapabilityIntegrationRecord): CapabilityIntegrationRecord {
  if (!record.evidence.licenseReviewed) throw new Error("license_review_required");
  if (!record.evidence.dataRightsReviewed) throw new Error("data_rights_review_required");
  if (!record.evidence.securityReviewed) throw new Error("security_review_required");
  if (!record.evidence.provenanceVerified) throw new Error("provenance_verification_required");
  if (record.treatment === "adapter" || record.treatment === "core-component") {
    if (!record.evidence.latencyReviewed) throw new Error("latency_review_required");
  }
  return { ...record, status: "assessed", evidenceHash: capabilityEvidenceHash(record.evidence), updatedAt: Date.now() };
}

export function approveCapabilityIntegration(record: CapabilityIntegrationRecord): CapabilityIntegrationRecord {
  if (record.status !== "assessed") throw new Error(`invalid_status_for_approval:${record.status}`);
  if (!allEvidencePassed(record.evidence)) throw new Error("all_capability_evidence_required");
  return { ...record, status: "approved", updatedAt: Date.now() };
}

export function deployCapabilityIntegration(record: CapabilityIntegrationRecord): CapabilityIntegrationRecord {
  if (record.status !== "approved") throw new Error(`invalid_status_for_deployment:${record.status}`);
  if (!allEvidencePassed(record.evidence)) throw new Error("deployment_requires_complete_evidence");
  return { ...record, status: "deployed", updatedAt: Date.now() };
}

export function rejectCapabilityIntegration(record: CapabilityIntegrationRecord, reason: string): CapabilityIntegrationRecord {
  if (!reason.trim()) throw new Error("rejection_reason_required");
  if (record.status === "deployed") throw new Error("deployed_capability_requires_rollback_before_rejection");
  return { ...record, status: "rejected", updatedAt: Date.now() };
}

export function retireCapabilityIntegration(record: CapabilityIntegrationRecord): CapabilityIntegrationRecord {
  if (record.status !== "deployed") throw new Error(`invalid_status_for_retirement:${record.status}`);
  return { ...record, status: "retired", updatedAt: Date.now() };
}

export function canEnterHelixCore(record: CapabilityIntegrationRecord): boolean {
  return record.status === "deployed"
    && record.coreDependencyAllowed
    && allEvidencePassed(record.evidence);
}

export function statusRank(status: IntegrationStatus): number {
  const rank = STATUS_ORDER.indexOf(status);
  return rank >= 0 ? rank : -1;
}

export interface CapabilityIntegrationStore {
  upsert(record: CapabilityIntegrationRecord): Promise<CapabilityIntegrationRecord>;
  get(id: string): Promise<CapabilityIntegrationRecord | null>;
  list(status?: IntegrationStatus): Promise<CapabilityIntegrationRecord[]>;
}

export class InMemoryCapabilityIntegrationStore implements CapabilityIntegrationStore {
  private readonly records = new Map<string, CapabilityIntegrationRecord>();

  async upsert(record: CapabilityIntegrationRecord): Promise<CapabilityIntegrationRecord> {
    this.records.set(record.id, { ...record, evidence: { ...record.evidence } });
    return { ...record, evidence: { ...record.evidence } };
  }

  async get(id: string): Promise<CapabilityIntegrationRecord | null> {
    const record = this.records.get(id);
    return record ? { ...record, evidence: { ...record.evidence } } : null;
  }

  async list(status?: IntegrationStatus): Promise<CapabilityIntegrationRecord[]> {
    return [...this.records.values()]
      .filter((record) => status == null || record.status === status)
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((record) => ({ ...record, evidence: { ...record.evidence } }));
  }
}

interface CapabilitySqlLike {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
}

function recordFromRow(row: Record<string, unknown>): CapabilityIntegrationRecord {
  const evidence = typeof row.evidence === "string" ? JSON.parse(row.evidence) : row.evidence;
  return {
    id: String(row.integration_id),
    benchmarkId: String(row.benchmark_id),
    sourceRepository: String(row.source_repository),
    sourceVersion: String(row.source_version),
    capability: String(row.capability),
    treatment: String(row.treatment) as CapabilityTreatment,
    componentName: String(row.component_name),
    status: String(row.status) as IntegrationStatus,
    coreDependencyAllowed: Boolean(row.core_dependency_allowed),
    evidence: evidence as CapabilityEvidence,
    provenance: String(row.provenance),
    implementationHash: String(row.implementation_hash),
    evidenceHash: String(row.evidence_hash),
    updatedAt: new Date(String(row.updated_at)).getTime(),
  };
}

export class SqlCapabilityIntegrationStore implements CapabilityIntegrationStore {
  private readonly sql: CapabilitySqlLike;
  constructor(sql: CapabilitySqlLike) { this.sql = sql; }

  async upsert(record: CapabilityIntegrationRecord): Promise<CapabilityIntegrationRecord> {
    const rows = await this.sql.query(
      `INSERT INTO capability_integration_registry
       (integration_id, benchmark_id, source_repository, source_version, capability, treatment, component_name,
        status, core_dependency_allowed, evidence, provenance, implementation_hash, evidence_hash, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12,$13,NOW())
       ON CONFLICT (integration_id) DO UPDATE SET
        benchmark_id=EXCLUDED.benchmark_id,
        source_repository=EXCLUDED.source_repository,
        source_version=EXCLUDED.source_version,
        capability=EXCLUDED.capability,
        treatment=EXCLUDED.treatment,
        component_name=EXCLUDED.component_name,
        status=EXCLUDED.status,
        core_dependency_allowed=EXCLUDED.core_dependency_allowed,
        evidence=EXCLUDED.evidence,
        provenance=EXCLUDED.provenance,
        implementation_hash=EXCLUDED.implementation_hash,
        evidence_hash=EXCLUDED.evidence_hash,
        updated_at=NOW()
       RETURNING *`,
      [record.id, record.benchmarkId, record.sourceRepository, record.sourceVersion, record.capability, record.treatment,
        record.componentName, record.status, record.coreDependencyAllowed, JSON.stringify(record.evidence), record.provenance,
        record.implementationHash, record.evidenceHash],
    );
    if (!rows[0]) throw new Error("capability_integration_upsert_failed");
    return recordFromRow(rows[0]);
  }

  async get(id: string): Promise<CapabilityIntegrationRecord | null> {
    const rows = await this.sql.query("SELECT * FROM capability_integration_registry WHERE integration_id = $1", [id]);
    return rows[0] ? recordFromRow(rows[0]) : null;
  }

  async list(status?: IntegrationStatus): Promise<CapabilityIntegrationRecord[]> {
    const rows = await this.sql.query(
      status == null
        ? "SELECT * FROM capability_integration_registry ORDER BY integration_id"
        : "SELECT * FROM capability_integration_registry WHERE status = $1 ORDER BY integration_id",
      status == null ? [] : [status],
    );
    return rows.map(recordFromRow);
  }
}

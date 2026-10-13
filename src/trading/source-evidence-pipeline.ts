import { buildEvidencePacket, EvidenceFanoutService, type EvidenceFanoutOptions, type EvidenceStore, type TradingEvidencePacket } from "./evidence.ts";
import { scoreEvidenceQuality, type EvidenceQuality } from "./evidence-quality.ts";
import type { PointInTimeBatch, PointInTimeObservation } from "./data/source-specific.ts";
import { stableHash } from "./runtime/task-results.ts";

export interface NormalizedSourceEvidenceOptions<T> {
  evidenceType: string;
  claim: (observation: PointInTimeObservation<T>) => string;
  confidence?: number | ((observation: PointInTimeObservation<T>) => number);
  sourceTier?: number;
  maxFreshnessMs?: number;
  requiredProvenance?: string[];
  fanout?: EvidenceFanoutOptions;
  evidenceIdPrefix?: string;
}

export interface NormalizedSourceEvidenceResult<T> {
  accepted: TradingEvidencePacket<T>[];
  rejected: PointInTimeBatch<T>["rejected"];
  inserted: number;
  duplicate: number;
  workerIds: string[];
}

function qualityFor<T>(observation: PointInTimeObservation<T>, batch: PointInTimeBatch<T>, options: NormalizedSourceEvidenceOptions<T>): EvidenceQuality {
  return scoreEvidenceQuality({
    sourceTier: options.sourceTier,
    eventTs: observation.eventTs,
    publishedTs: observation.publishedTs,
    availableTs: observation.availableTs,
    retrievedTs: Number(observation.provenance.retrievedTs ?? batch.asOfTs),
    asOfTs: batch.asOfTs,
    provenance: observation.provenance,
    requiredProvenance: options.requiredProvenance ?? ["source"],
    maxFreshnessMs: options.maxFreshnessMs,
    pointInTimeValid: true,
  });
}

export class NormalizedSourceEvidencePipeline {
  private readonly evidence: EvidenceStore;
  private readonly fanout: EvidenceFanoutService;

  constructor(input: { evidence: EvidenceStore; fanout: EvidenceFanoutService }) {
    this.evidence = input.evidence;
    this.fanout = input.fanout;
  }

  async ingestBatch<T>(batch: PointInTimeBatch<T>, options: NormalizedSourceEvidenceOptions<T>): Promise<NormalizedSourceEvidenceResult<T>> {
    const accepted: TradingEvidencePacket<T>[] = [];
    const workerSet = new Set<string>();
    let inserted = 0;
    let duplicate = 0;

    for (const observation of batch.observations) {
      const quality = qualityFor(observation, batch, options);
      const retrievedTs = Number(observation.provenance.retrievedTs ?? batch.asOfTs);
      const evidenceId = `${options.evidenceIdPrefix ?? batch.source}:${observation.subjectId}:${observation.eventTs}:${await stableHash(observation.value)}`;
      const packet = await buildEvidencePacket({
        evidenceId,
        subjectId: observation.subjectId,
        evidenceType: options.evidenceType,
        claim: options.claim(observation),
        confidence: typeof options.confidence === "function" ? options.confidence(observation) : options.confidence ?? quality.score,
        source: batch.source,
        eventTs: observation.eventTs,
        publishedTs: observation.publishedTs,
        retrievedTs,
        payload: observation.value,
        quality,
        provenance: {
          ...observation.provenance,
          pointInTime: {
            eventTs: observation.eventTs,
            publishedTs: observation.publishedTs,
            availableTs: observation.availableTs,
            asOfTs: batch.asOfTs,
          },
          quality,
        },
      });

      const routed = await this.fanout.publish(packet, options.fanout);
      if (routed.inserted) inserted += 1;
      else duplicate += 1;
      accepted.push(packet);
      for (const workerId of routed.workerIds) workerSet.add(workerId);
    }

    return { accepted, rejected: batch.rejected, inserted, duplicate, workerIds: [...workerSet].sort() };
  }
}


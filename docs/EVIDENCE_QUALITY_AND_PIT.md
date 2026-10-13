# Evidence Quality and Point-in-Time Pipeline

v0.20 adds the durable bridge from normalized source observations into the Helix evidence graph.

## Normalized observation flow

1. A source-specific adapter retrieves data using its point-in-time contract.
2. The adapter normalizes each accepted observation into `eventTs`, `publishedTs`, `availableTs`, `value`, and provenance.
3. `NormalizedSourceEvidencePipeline` creates a deterministic evidence ID from source, subject, event time, and observation content.
4. The evidence packet stores PIT metadata, provenance, deterministic content hash, and a structured quality score.
5. The existing `EvidenceFanoutService` persists the packet and creates bounded specialist review tasks.
6. Evidence queries can require a minimum durable quality score.

## Quality model

The deterministic score is composed from source tier, point-in-time validity, provenance completeness, freshness at the requested as-of timestamp, and temporal metadata completeness. The score is research metadata, not a trade signal and not a guarantee of truth.

Quality dimensions are persisted in the evidence packet and duplicated under provenance for auditability. Future production versions may add source-specific reliability priors and empirical historical accuracy, but those must remain separate from the current deterministic baseline.

## Safety properties

- Observations rejected by the source adapter's PIT validator never enter the accepted evidence set.
- Evidence IDs are deterministic, so retries do not create duplicate logical observations.
- Evidence fan-out remains bounded and idempotent.
- Quality can be filtered at the durable evidence-store boundary with `minQuality`.
- Source credentials, API limits, and licensing remain deployment concerns; this layer does not imply permission to redistribute provider data.

## Current limitation

The current quality score is deterministic metadata. It does not yet learn empirical source reliability from historical prediction accuracy, nor does it replace independent corroboration. The next reasoning layer must use quality as one evidence feature among several rather than treating a high score as proof.

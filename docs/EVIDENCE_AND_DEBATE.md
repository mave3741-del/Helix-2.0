# Evidence Fan-out and Multi-round Debate

## v0.16

Helix now has a durable evidence/debate boundary for coordinated specialist research.

### Evidence packets

`src/trading/evidence.ts` defines provenance-rich `TradingEvidencePacket` records with:

- deterministic evidence ID
- subject and evidence type
- explicit claim and bounded confidence
- source, event/publication/retrieval timestamps
- raw payload plus provenance metadata
- SHA-256-style deterministic content hash

Evidence storage is append-only/idempotent through `EvidenceStore` implementations.

### Evidence fan-out

`EvidenceFanoutService` resolves relevant workers through the persistent worker registry and creates deterministic `evidence.review` tasks:

`evidence-review:<evidence-id>:<worker-id>`

Fan-out is bounded (maximum 256 recipients) and routing can target family, market, capability, or a preferred worker. Existing evidence/worker combinations remain idempotent.

### Councils

The debate layer defines specialist councils for Macro, Fundamental, Technical, Quant, Derivatives, Crypto, News & Event, Strategy Lab, Risk, Execution, Adversarial Research, and Evidence/Knowledge.

Council participants are selected from matching worker families/capabilities and deduplicated. A debate session stores its participant set, subject, topic, council IDs, rounds, and final decision.

### Multi-round debate

`DebateCoordinator` supports:

`OPEN SESSION -> OPEN ROUND -> DURABLE TURN TASKS -> RECORD INDEPENDENT TURNS -> CLOSE ROUND -> NEXT ROUND -> FINALIZE`

Each turn stores stance (`bull`, `bear`, `neutral`, `abstain`), argument, supporting evidence IDs, confidence, and explicit challenged turn IDs. A round cannot close until its configured minimum number of independent turns exists. A finalized session requires a closed current round and an explicit rationale.

The system records the decision; it does not treat vote count alone as truth. Evidence and dissent remain attached for later audit and research learning.

### Persistence

Migration `0008_trading_evidence_debate.sql` adds durable evidence packets, evidence fan-out records, debate sessions, rounds, and turns with uniqueness constraints that prevent duplicate delivery/turn records.

### Test coverage

Dedicated evidence/debate tests cover packet idempotency, deterministic specialist fan-out, fan-out idempotency, sequential rounds, independent-turn minimums, explicit dissent/challenges, finalization gating, and per-worker-per-round idempotency.

The broader focused trading regression also covers the task queue, 1,000-worker registry/supervisor, runtime snapshots, paper execution, journal, replay manifests, realtime adapters, replay, and strategy evolution.

Live trading remains disabled. Evidence/debate outputs are research inputs and cannot bypass the independent risk engine.

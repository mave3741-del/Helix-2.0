# HELIX Phase 10 — Capability Integration Architecture

## Phase 10.1 — Governed Capability Integration Admission

Phase 10 begins by turning the benchmark registry into an enforceable integration boundary. External projects are capability references, adapters, optional components, or reimplementation sources; they do not become core dependencies merely because they are useful.

### Admission evidence
Every candidate capability must carry:

- upstream repository and exact source version;
- treatment: reference, adapter, optional-component, reimplement, or core-component;
- license and data-rights review;
- security review;
- test verification;
- latency review for runtime adapters/core components;
- provenance verification;
- reproducibility verification;
- deterministic implementation and evidence hashes.

### Fail-closed lifecycle
`PROPOSED → ASSESSED → APPROVED → DEPLOYED → RETIRED`

A candidate can also be explicitly rejected. Deployment is blocked until the required evidence is present. Reference/reimplementation treatments cannot accidentally become core dependencies.

### Durable state
Migration `0038_capability_integration_registry.sql` adds a PostgreSQL registry for the integration decision and its evidence hashes. An in-memory store is available for deterministic tests; a SQL store is provided for the durable runtime boundary.

### Safety boundary
This phase does not grant workers third-party permissions, network access, credentials, wallet access, or live-trading authority. It governs whether an external capability may enter HELIX and under what treatment.

### Next Phase 10 work
The next slices should build capability-specific contracts for quant research, event-driven execution, market/crypto connectivity, financial-data sources, sentiment/news, and optional ML/RL layers. Each must use this admission boundary before deployment.

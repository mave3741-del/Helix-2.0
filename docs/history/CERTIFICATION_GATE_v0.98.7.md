# HELIX Certification Gate v0.98.7

## Phase 8.8 — External Attestation + Connector Probe Hardening

Status: engineering-complete; external staging evidence remains environment-dependent.

### Added
- Signed deployment-attestation verification is mandatory for external certification.
- Bounded, public-endpoint-only connector staging probe with redirect denial, timeout and response-size limits.
- Secret-safe evidence artifacts: no bearer token, database URL, or response body is persisted.
- External GitHub workflow now requires attestation and connector probe inputs.

### Local verification boundary
- Deployment attestation: BLOCKED — no externally-issued attestation token/public key configured.
- Connector probe: BLOCKED — no external staging connector endpoint configured.
- Live execution: DISABLED.
- Real PostgreSQL/connector/deployment sandbox evidence: external prerequisite.

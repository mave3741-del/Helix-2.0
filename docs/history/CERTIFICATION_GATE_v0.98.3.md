# HELIX Certification Gate v0.98.3

## Phase 8.4 — External Evidence Replay Verification

Status: ENGINEERING-COMPLETE; live execution remains disabled.

### Scope
Adds deterministic offline validation of a saved Phase 8.1 external-certification evidence artifact. The verifier does not rerun external infrastructure and cannot enable live execution.

### Checks
- evidence schema and gate identity
- required structural fields
- prerequisite status/reason shape
- unique execution step names
- valid execution statuses
- rejection of credential-shaped keys such as DATABASE_URL, reviewerId, implementerId, password, token, secret, apiKey, privateKey, accessToken, and refreshToken
- deterministic SHA-256 evidence-hash recomputation

### Verification
Focused verifier/external-certification tests: 7/7 PASS.

Full dependency-backed certification remains external-environment pending.

Live execution: DISABLED.

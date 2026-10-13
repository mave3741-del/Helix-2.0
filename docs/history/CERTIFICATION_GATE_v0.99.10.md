# Certification Gate v0.99.10 — Phase 9.6 Runtime Deployment Admission

## Local engineering gates
- Phase 9.6 admission tests: PASS
- Coverage integrity: PASS (113/113)
- Migration integrity: PASS (34/34)
- Release integrity: PASS
- Live execution: DISABLED

## Admission contract
A certified worker deployment may start only when:
1. A durable deployment-review binding exists for the exact deployment identity and application version.
2. The binding decision is `deploy` and has not expired.
3. The runtime attestation identity/version matches the bound identity/version.
4. The runtime attestation hash equals the bound attestation hash.
5. The attestation has not expired and does not outlive the review binding.
6. Worker isolation, network egress enforcement, secrets isolation, and live execution disabled are all asserted.

Any mismatch returns `deployment_admission_blocked:*` and the worker bootstrap must not proceed.

## External certification boundary
Not a substitute for real external evidence. PostgreSQL, connector permissions, deployment-host sandbox evidence, dependency-complete CI, signed external attestation, and independent external review remain required for a real certification PASS.

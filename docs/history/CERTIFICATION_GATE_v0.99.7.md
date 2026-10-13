# Certification Gate v0.99.7 — Phase 9.3 Sealed Evidence Replay

## Gate
Phase 9.3 adds deterministic replay of the Phase 9.2 sealed external-certification bundle.

## Verified locally
- Sealed-bundle replay tests: 3/3 PASS.
- External-evidence verifier tests: 3/3 PASS.
- Evidence-sealing contract tests: 4/4 PASS.
- Combined focused certification tests: 10/10 PASS.
- Migration integrity: 32/32 PASS.
- Test coverage integrity: 111/111.
- Release integrity: PASS.

## Fail-closed proof
The replay verifier rejects changed artifact bytes and mismatched `SEALED.flag` values. It also rejects altered manifests, unsafe filenames, forbidden credential-shaped keys, and invalid embedded certification evidence.

## External boundary
This gate does not certify a real deployment. PostgreSQL, staging connector permissions, deployment sandbox/attestation, dependency-complete CI, and independent reviewer evidence remain external prerequisites. Live trading remains disabled.

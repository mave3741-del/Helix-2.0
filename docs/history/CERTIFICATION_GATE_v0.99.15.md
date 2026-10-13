# Certification Gate v0.99.15 — Phase 9.11

## Result
**LOCAL ENGINEERING GATE PASS / EXTERNAL CERTIFICATION PENDING**

Phase 9.11 reconciles the independent evidence artifacts required for a real certification decision and fails closed when any required artifact is missing, mismatched, or non-PASS.

## Implemented
- `scripts/certification-evidence-reconcile.mjs`
- `scripts/certification-evidence-reconcile.test.mjs`
- npm script: `phase9.11:reconcile`
- package/lock version: `0.99.15`

## Required evidence for PASS
1. Real PostgreSQL certification evidence.
2. External certification evidence.
3. Connector staging probe evidence.
4. Deployment attestation verification.
5. Certification run ledger with live execution disabled.
6. Package-version agreement across the evidence set.

The reconciler writes `artifacts/certification-evidence-reconciliation.json` and returns `BLOCKED` until genuine evidence exists.

Real external certification is not claimed in the development container.

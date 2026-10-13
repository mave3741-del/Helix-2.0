# Certification Gate v0.99.9 — Phase 9.5

## Local gate
- `npm run phase9.5:binding` — PASS (18/18)
- `npm run migration:integrity` — PASS (34/34 numbered migrations)
- `npm run test:coverage-integrity` — PASS (112/112 test files reachable)
- `npm run release:integrity` — PASS

## Deployment-review binding contract
A valid binding requires:
1. Independent reviewer identity distinct from implementer.
2. Valid reviewer decision hash.
3. Deployment identity matches attestation `deploymentId`.
4. Package/application version matches attestation `appVersion`.
5. Decision and attestation expiry are future and bounded; attestation cannot outlive the decision.
6. Worker isolation, restricted network egress, secrets isolation, and live execution disabled are attested.
7. Binding hash is deterministic and stored append-only.

## External blockers
External certification remains BLOCKED until real infrastructure evidence is supplied: PostgreSQL, connector staging permissions/probe, deployment-host sandbox attestation, dependency-complete CI, and independent external review. No live execution enablement is implied.

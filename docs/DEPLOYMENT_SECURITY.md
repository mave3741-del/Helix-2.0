# Helix Deployment Security Contract

A production deployment must prove three properties outside the application process: worker isolation, network egress enforcement, and secret isolation. The application accepts this proof only as an externally signed Ed25519 attestation. The private signing key must remain in the deployment/orchestration layer; it must never be available to the Helix application or worker processes.

The attestation token is stored in `HELIX_DEPLOYMENT_ATTESTATION` and the public key in `HELIX_DEPLOYMENT_ATTESTATION_PUBLIC_KEY`. The signed payload must set `workerIsolationEnforced`, `networkEgressEnforced`, `secretsIsolationEnforced`, and `liveExecutionDisabled` to true and must have a bounded validity window.

Readiness now requires a valid deployment attestation in addition to the existing sandbox self-test, egress-policy verification, and production-isolation flag. Missing, expired, invalid, or unsafe attestations fail closed.

Deployment-level enforcement should use a rootless container/VM or equivalent isolation with read-only application filesystem where practical, dropped Linux capabilities, `no-new-privileges`, explicit resource limits, and explicit network policy. The source code can verify the signed claim but cannot by itself prove the external enforcement mechanism; that proof belongs to the deployer.

Database certification is split into two checks. `npm run db:smoke` performs a deterministic PGLite migration and schema round-trip test in any clean CI environment. `npm run db:migrate` remains the real Postgres/Neon deployment migrator and must be exercised with a real `DATABASE_URL` before production rollout.

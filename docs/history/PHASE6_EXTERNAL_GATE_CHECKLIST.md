# Phase 6 External Certification Checklist

These items intentionally remain external to the source-only package:

1. Set a real `DATABASE_URL` for the staging Postgres instance and run `npm run db:verify`.
2. Provide reviewed connector credentials/permissions and run connector readiness attestation with `HELIX_EXTERNAL_STAGING=true`.
3. Run the deployment sandbox on the actual staging host/VM/container and capture the runtime probe evidence.
4. Provide separate `HELIX_IMPLEMENTER_ID` and `HELIX_INDEPENDENT_REVIEWER_ID` identities and complete the review gate.
5. Run clean dependency-backed `npm ci`, `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build` on the deployment environment.
6. Keep live execution disabled until all above evidence is independently reviewed.

# Phase 9 — External Certification Reproducibility

## Purpose
Phase 9 turns the remaining external boundary into a repeatable certification procedure without fabricating infrastructure evidence. The repository can prepare and validate the certification environment, but an actual PASS still requires a real PostgreSQL target, allowlisted staging connector, deployment-host sandbox, signed deployment attestation, and independent reviewer evidence.

## Preflight
Run:

`npm run phase9:preflight`

The command writes `artifacts/phase9-external-certification-preflight.json`. It never serializes database URLs, bearer tokens, private keys, or full connector URLs into that artifact.

A READY result means the required external environment is present. BLOCKED is the correct result when the external boundary is unavailable.

## Certification
After preflight is READY:

`npm run phase9:certify`

This delegates to the existing fail-closed external certification orchestrator, which runs environment verification, release/migration/coverage gates, Phase 6/7 gates, full CI certification, real PostgreSQL verification, immutability verification, deployment sandbox verification, signed deployment attestation verification, and connector staging probe.

## PostgreSQL requirement
`DATABASE_URL` must point to a real PostgreSQL/Neon deployment for external proof. PGlite is used only for local schema smoke tests and does not satisfy this external requirement.

## Connector requirement
The connector probe must target a public HTTP(S) endpoint that is explicitly allowlisted. Private/local network destinations, embedded credentials, redirects, oversized responses, and unbounded latency are rejected.

## Deployment requirement
The deployment host must provide container isolation, restricted network egress, isolated filesystem access, privilege restriction, raw-key denial, worker built-in/network escape blocking, and a signed deployment attestation.

## Reviewer requirement
The reviewer identity must differ from the implementer identity, and conflicts must be explicitly declared.

## Safety boundary
Live execution remains disabled. Phase 9 certification evidence does not enable live trading, grant capital authority, bypass the risk engine, or approve individual trades.

# HELIX Production Verification Contract

## Local / embedded verification
- `npm run migration:integrity` — hashes all numbered migrations in deterministic order and rejects duplicate sequence numbers.
- `npm run db:smoke` — applies the migration set to PGlite and exercises a real schema round-trip.
- `npm run ci:certify` — typecheck, lint, full test suite, PGlite smoke, and build.

## Staging / production verification
- Set a valid `DATABASE_URL` for the staging/Neon Postgres database.
- Run `npm run db:migrate` to apply pending migrations atomically.
- Run `npm run db:verify` to verify the complete migration set, Phase-3 tables/columns, and the unique closed-loop decision-hash index.
- Run `npm run ci:prod` for the full software certification plus real-DB verification.

`db:verify` fails closed when `DATABASE_URL` is absent; it must not silently substitute the PGlite fallback for a production verification request.

## Closed-loop immutability
Closed-loop governance decisions are written with a deterministic SHA-256 decision hash and duplicate cycle IDs are ignored. The real database verification must additionally attempt a duplicate cycle insertion and confirm that the original decision remains unchanged.

## Live boundary
This verification contract does not enable live trading. Live execution remains disabled until software, data, security, risk, observability, governance, deployment isolation, and independent readiness gates all pass.

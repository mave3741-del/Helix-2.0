# Helix Phase 1 Audit Remediation — v0.25

This document records the third-pass adversarial hardening after the v0.24 Phase 1 remediation.

## Third-pass findings closed

- On-chain PIT: missing provider availability now defaults to actual retrieval time.
- CFTC PIT: date-only release timestamps resolve to 3:30pm Eastern; missing release time fails closed unless an explicit lag is configured.
- SEC 13F historical units: pre-2023 XML defaults to the legacy thousands multiplier; explicit configuration overrides it.
- Evidence determinism: source content hashes exclude volatile response headers; repeated retrieval of identical source content yields stable evidence IDs.
- Evidence timestamp integrity: publication/availability timestamps are validated against retrieval time.
- DNS/SSRF: production source fetch and worker egress paths reject resolved private/link-local/mapped-private destinations in addition to hostname allowlists.
- Response memory safety: JSON/text source adapters and sandbox broker use streaming size bounds.
- CEO graph integrity: stale terminal tasks cannot become active dependency parents during reconciliation.

## Verification

- Packaged `src/trading` suite: **89/89 PASS**.
- Targeted source/PIT/sandbox/evidence hardening checks: **20/20 PASS** in the third-pass run.
- Migration-plan regression suite: **8/8 PASS**.
- Broad repository suite remains limited by missing environment dependencies and pre-existing `.grok/OG` fixture failures.
- `npm run typecheck`: blocked by missing `@types/node` / `vite/client` in the provided partially installed workspace.
- `npm run lint`: blocked because `eslint` is unavailable.
- Dependency installation attempt timed out in the provided container.
- Live trading remains disabled.

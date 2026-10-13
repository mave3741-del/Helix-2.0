# Phase 9.2 — Evidence-Sealed External Certification Handoff

## Purpose
Phase 9.2 converts a successful external certification run into a reviewer-ready evidence bundle. The bundle is deterministic, credential-safe, and hash-sealed.

## Preconditions
Run `npm run phase9:preflight` and then `npm run phase9:certify` on the external certification host.

The sealing step intentionally refuses to run unless the certification evidence reports `PASS`, the preflight reports `READY`, and `scripts/external-evidence-verify.mjs` succeeds.

## Seal
Run:

`npm run phase9:seal`

Output:

- `artifacts/external-certification-bundle/manifest.json`
- `artifacts/external-certification-bundle/SEALED.flag`
- `artifacts/external-certification-bundle.json`

The manifest contains only safe status metadata, artifact hashes, package/lockfile identity, and the explicit live-execution-disabled boundary. Database URLs, reviewer/implementer identities, credentials, tokens, and private keys are not serialized.

## Reviewer handoff
The reviewer receives the sealed bundle directory plus its bundle hash. Any changed file alters its SHA-256 entry and therefore invalidates the bundle hash.

## Safety boundary
Sealing evidence does not enable live execution, approve capital, bypass risk checks, or authorize individual trades.

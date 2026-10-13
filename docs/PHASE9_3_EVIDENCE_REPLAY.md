# Phase 9.3 — Sealed Evidence Replay

Phase 9.3 adds an independent replay verifier for the Phase 9.2 sealed certification bundle.

## Replay

`npm run phase9.3:replay`

The verifier checks:

- bundle manifest schema and gate identity;
- `SEALED.flag` matches the manifest bundle hash;
- every manifest-listed artifact exists with the recorded byte length and SHA-256;
- credential-shaped keys are absent from sealed JSON artifacts;
- the manifest bundle hash recomputes exactly;
- the embedded external certification evidence replays through `external-evidence-verify.mjs`;
- live execution remains explicitly disabled and reviewer/database connection material is not serialized.

A changed file, altered manifest, changed seal flag, or invalid embedded evidence causes a fail-closed result.

## Safety boundary

Replay verifies evidence; it does not create certification evidence, approve capital, enable live trading, or bypass the external certification gate.

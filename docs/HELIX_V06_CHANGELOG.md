# Helix Trading Intelligence v0.6

## Added
- Point-in-time validation to prevent look-ahead information from entering historical research.
- Market-data quality checks for duplicate timestamps, invalid OHLC, bad volume, and non-monotonic data.
- Market replay utility that evaluates decisions using only history available up to each bar.
- Versioned strategy-genome representation with bounded deterministic mutation and provenance.
- Portfolio-level gross/net/concentration exposure checks independent from LLM reasoning.
- Native tool factory exposure for the new research/risk primitives.

## Verification
- Native trading/tool tests: 11 passed.
- Replay test: passed.
- Full project typecheck/build remains pending because this source bundle does not include installed `node_modules`.

## Design rule
No native research tool grants credential, private-key, wallet, or unrestricted host access. Live execution remains a separate controlled layer behind hard risk controls.

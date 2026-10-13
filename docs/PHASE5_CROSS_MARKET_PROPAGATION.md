# HELIX Phase 5.3 — Cross-Market News Propagation

Phase 5.3 extends news-aware market routing from direct symbol/market matching to bounded cross-market propagation.

## Flow

`News impact assessment → deterministic cross-market relation map → bounded hop decay → candidate propagation → specialist analysis`

The propagation layer uses deterministic relation maps for rate decisions, macro releases, regulatory events, crypto events and corporate events. Each relationship carries a confidence and hop distance; boost decays by hop and is capped by policy.

## Safety boundary

Propagation is an evidence-prioritization mechanism, not a trade signal. It does not bypass point-in-time checks, specialist review, portfolio/risk gates, or execution controls. Direct matches are deliberately prevented from receiving the full propagated boost a second time.

# Phase 5.2 — News to Market Candidate Bridge

The Phase 5.2 bridge takes deterministic news-impact assessments and applies them to the existing 1,000-market scan candidates.

## Behavior
- Direct symbol matches receive a stronger boost than broad market matches.
- Severity and urgency contribute to the boost with bounded deterministic weights.
- Original market-scan reasons are preserved and news reasons are appended.
- Article IDs remain attached to each candidate for provenance and downstream evidence review.
- News without affected markets/symbols is reported as unroutable instead of being silently treated as actionable.
- Queue tasks explicitly require PIT validation and independent risk review before any trade decision.

## Safety boundary
News never directly places an order. Candidate ranking remains upstream of evidence review, portfolio/risk gates, and execution readiness. Live execution remains disabled.

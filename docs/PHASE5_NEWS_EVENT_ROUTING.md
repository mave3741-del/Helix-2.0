# HELIX Phase 5 — News/Event Impact Routing

Phase 5 starts by turning the new public-news layer into an actionable research-routing layer.

## Flow

`News article → PIT validation → deterministic impact assessment → affected markets/symbols → council routing → specialist tasks`

The router classifies event kind, impact severity, urgency, directional context, confidence, affected markets, symbols and relevant councils. It then creates durable `news.impact.review` tasks for available specialists.

This is an **evidence-routing layer, not an automatic trading signal**. Risk/execution gates remain independent.

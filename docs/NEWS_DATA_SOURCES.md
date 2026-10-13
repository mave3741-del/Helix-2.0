# HELIX News/Data Source Matrix

This module was seeded from the user-provided "Trading News Channels + Multi-Market AI Agents" guide and then checked against current provider documentation where available.

## Auto-supported in code

| Source | Acquisition | Default use | Key | PIT | Notes |
|---|---|---|---|---|---|
| SEC EDGAR | official API/RSS | equity filings / insider / 13F workflows | no | yes | Official SEC availability/acceptance timestamps are authoritative. |
| FRED/ALFRED | official API | macro/rates/inflation | yes | yes | API key required; vintage windows are preserved. |
| Alpha Vantage News | API | ticker news + sentiment | yes | yes | Existing adapter; free usage limits apply. |
| Marketaux | API | global market news | yes | source-dependent | Free plan currently advertises 100 requests/day and 3 articles/request. |
| NewsData.io | API | broad global news | yes | delayed free tier | Free plan is limited/delayed; never sole low-latency source. |
| GNews | API | broad news search | yes | delayed free tier | Current free plan is for development/testing and non-commercial use. |
| Finnhub News | API | market/finance news | yes | source-dependent | Free tier is rate-limited; verify current commercial terms. |
| Public RSS feeds | RSS/Atom | low-cost continuous headlines | no | yes, subject to publisher timestamps | Publisher terms/robots/licensing must be reviewed before redistribution. |
| Binance public endpoints | official API | crypto market data | no for public market endpoints | yes | Subject to current Binance API terms/rate limits. |
| CoinGecko public API | official API | crypto market/reference data | no/depends on plan | yes | Public access is rate-limited and terms apply. |

## Seeded RSS feeds

Google AI, OpenAI News, Hugging Face Blog, arXiv cs.AI, BBC World, CoinDesk, Cointelegraph, Decrypt, The Verge AI, MIT Technology Review AI and The Guardian World are included as configured feed definitions.

The feed adapter is allowlisted, bounded, timeout-protected and point-in-time checked. A feed should only be promoted to an authoritative production input after a live fetch, licensing/terms review, publisher availability check and provenance test.

## Sources intentionally not defaulted to the free path

Bloomberg, Reuters/LSEG premium services, Benzinga Pro, RavenPack/Bigdata and similar institutional feeds remain optional premium connectors. They should not be treated as free simply because public headlines/RSS may exist.

Social sources (X, Reddit, StockTwits, Telegram, Discord) are evidence/sentiment inputs, not authoritative truth. Manipulation risk and terms must be handled separately.

## Current free-tier reality

Provider limits and commercial terms can change. HELIX stores source classification and licensing-review state explicitly so a source cannot silently become an authoritative production feed just because an API key exists.

### v0.62 official event feeds

The built-in RSS catalog now also includes official high-signal regulatory and central-bank feeds: SEC press releases, CFTC press releases/enforcement, ECB press releases and EUR/USD reference rates, and Federal Reserve press releases/policy rates. These are intended as event-detection inputs for equities, FX, commodities and macro.

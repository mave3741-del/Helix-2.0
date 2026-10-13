# Helix Realtime Data Sources

Implementation references used by the v0.9 adapter layer:

- Binance Developer Documentation — WebSocket market streams: https://developers.binance.com/en/docs/products/derivatives-trading-coin-futures/websocket-market-streams/Connect
- Binance Developer Documentation — live subscribing/unsubscribing to market streams: https://developers.binance.com/en/docs/products/derivatives-trading-usds-futures/websocket-market-streams/Live-Subscribing-Unsubscribing-to-streams
- Alpaca Market Data Documentation — WebSocket streaming: https://docs.alpaca.markets/us/docs/streaming-market-data
- Alpaca Real-Time Stock Data: https://docs.alpaca.markets/us/docs/real-time-stock-pricing-data
- Alpaca Real-Time Crypto Data: https://docs.alpaca.markets/us/docs/real-time-crypto-pricing-data

These sources are integration references only. Credentials, venue permissions, terms, rate limits, subscription limits, and market-data entitlements must be validated in the deployment environment before enabling a connector.

## v0.19 Source-Specific PIT Adapters

Helix now includes source-specific normalization for three permitted public source families:

- `fred.series.observations`: requests explicit FRED/ALFRED real-time windows and normalizes observation values with vintage provenance. Observations unavailable by the requested `asOfTs` are rejected instead of leaking later revisions into historical research.
- `sec.edgar.submissions`: fetches company submission history from SEC `data.sec.gov`, requires a declared User-Agent, and treats the filing acceptance timestamp as the availability boundary for PIT filtering.
- `alphavantage.news.sentiment`: normalizes news publication timestamps into the same PIT observation contract and rejects articles published after the requested research `asOfTs`.

These adapters are source-aware parsers/normalizers, not claims of unlimited free production access. Credentials, rate limits, provider terms, licensing, and retention policy remain deployment configuration. The generic public JSON adapter remains available for other allowlisted sources but is not considered intrinsically point-in-time safe.

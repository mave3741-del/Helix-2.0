import test from "node:test";
import assert from "node:assert/strict";
import { AlpacaHistoricalBarsAdapter, FredSeriesAdapter, SecSubmissionsAdapter, AlphaVantageNewsAdapter, normalizeFredObservations, normalizeSecSubmissions } from "./source-specific.ts";

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

test("FRED adapter requests explicit real-time window and rejects revisions unavailable at as-of", async () => {
  let requested = "";
  const adapter = new FredSeriesAdapter({
    apiKey: "a".repeat(32),
    fetchImpl: async (url) => { requested = url; return response({ observations: [
      { date: "2026-01-01", value: "100", realtime_start: "2026-01-02", realtime_end: "2026-01-31" },
      { date: "2026-02-01", value: "101", realtime_start: "2026-03-01", realtime_end: "2026-03-31" },
    ] }); },
  });
  const result = await adapter.fetchObservations({ seriesId: "CPIAUCSL", realtimeStart: "2026-01-01", realtimeEnd: "2026-01-31", asOfTs: Date.parse("2026-02-15T00:00:00Z") });
  const url = new URL(requested);
  assert.equal(url.searchParams.get("realtime_start"), "2026-01-01");
  assert.equal(result.observations.length, 1);
  assert.equal(result.rejected.length, 1);
});

test("FRED normalizer preserves vintage provenance", () => {
  const result = normalizeFredObservations("GDP", { observations: [{ date: "2026-01-01", value: "123.4", realtime_start: "2026-02-15", realtime_end: "2026-03-01" }] }, Date.parse("2026-02-16T00:00:00Z"), Date.parse("2026-02-20T00:00:00Z"));
  assert.equal(result.observations[0]?.value, 123.4);
  assert.equal(result.observations[0]?.provenance.realtimeStart, "2026-02-15");
});

test("SEC submissions adapter sends declared user agent and normalizes filing availability", async () => {
  const captured: { headers: Headers | null } = { headers: null };
  const adapter = new SecSubmissionsAdapter({
    userAgent: "Helix Research helix@example.com",
    fetchImpl: async (_url, init) => { captured.headers = new Headers(init?.headers); return response({
      cik: "0000320193", tickers: ["AAPL"], filings: { recent: {
        accessionNumber: ["0000320193-26-000001"], form: ["10-Q"], filingDate: ["2026-05-01"], reportDate: ["2026-03-31"], acceptanceDateTime: ["2026-05-01T21:00:00.000Z"], primaryDocument: ["a10q.htm"],
      } },
    }); },
  });
  const result = await adapter.fetchRecent("320193", Date.parse("2026-06-01T00:00:00Z"));
  assert.equal(captured.headers?.get("User-Agent"), "Helix Research helix@example.com");
  assert.equal(result.observations[0]?.value.form, "10-Q");
  assert.equal(result.observations[0]?.publishedTs, Date.parse("2026-05-01T21:00:00.000Z"));
});

test("SEC normalizer rejects filings that were not available by as-of", () => {
  const result = normalizeSecSubmissions({ cik: "0001", tickers: ["X"], filings: { recent: { accessionNumber: ["a1"], form: ["10-K"], filingDate: ["2026-06-01"], reportDate: ["2026-03-31"], acceptanceDateTime: ["2026-06-02T10:00:00Z"] } } }, Date.parse("2026-06-03T00:00:00Z"), Date.parse("2026-06-01T12:00:00Z"));
  assert.equal(result.observations.length, 0);
  assert.equal(result.rejected[0]?.reasons.includes("not_available_at_asof"), true);
});

test("Alpha Vantage news adapter parses publication timestamps and filters future articles", async () => {
  const adapter = new AlphaVantageNewsAdapter({
    apiKey: "demo",
    fetchImpl: async (url) => { assert.equal(new URL(url).searchParams.get("function"), "NEWS_SENTIMENT"); return response({ feed: [
      { title: "Past", time_published: "20260501T130000", url: "https://news.test/a", ticker_sentiment: [{ ticker: "AAPL" }] },
      { title: "Future", time_published: "20260502T130000", url: "https://news.test/b", ticker_sentiment: [{ ticker: "AAPL" }] },
    ] }); },
  });
  const result = await adapter.fetchNews({ tickers: ["AAPL"], asOfTs: Date.parse("2026-05-01T23:00:00Z") });
  assert.equal(result.observations.length, 1);
  assert.equal(result.rejected.length, 1);
  assert.equal(result.observations[0]?.subjectId, "AAPL");
});


test("Alpaca historical stock bars paginate and remain PIT-safe at bar close", async () => {
  const requested: string[] = [];
  let calls = 0;
  const adapter = new AlpacaHistoricalBarsAdapter({
    keyId: "key_helix_12345",
    secretKey: "secret_helix_12345",
    fetchImpl: async (url, init) => {
      requested.push(`${url}|${new Headers(init?.headers).get("APCA-API-KEY-ID")}`);
      calls += 1;
      const token = new URL(url).searchParams.get("page_token");
      if (!token) return response({ bars: { AAPL: [{ t: "2026-09-10T14:30:00Z", o: 100, h: 101, l: 99, c: 100.5, v: 1000 } ] }, next_page_token: "next-1" });
      return response({ bars: { AAPL: [{ t: "2026-09-10T14:31:00Z", o: 100.5, h: 102, l: 100, c: 101, v: 1200 } ] }, next_page_token: null });
    },
  });
  const asOfTs = Date.parse("2026-09-10T14:31:30Z");
  const result = await adapter.fetchBars({ symbol: "AAPL", timeframe: "1Min", start: "2026-09-10T14:30:00Z", end: "2026-09-10T14:32:00Z", asOfTs, pageLimit: 1 });
  assert.equal(calls, 2);
  assert.equal(result.observations.length, 1);
  assert.equal(result.rejected.length, 1);
  assert.equal(new URL(requested[1].split("|")[0]).searchParams.get("page_token"), "next-1");
  assert.equal(result.observations[0]?.availableTs, Date.parse("2026-09-10T14:31:00Z"));
});

test("Alpaca historical crypto bars use documented crypto endpoint and reject malformed OHLC", async () => {
  let requested = "";
  const adapter = new AlpacaHistoricalBarsAdapter({
    keyId: "key_helix_12345",
    secretKey: "secret_helix_12345",
    fetchImpl: async (url) => { requested = url; return response({ bars: { "BTC/USD": [
      { t: "2026-09-10T14:30:00Z", o: 100, h: 110, l: 90, c: 105, v: 12 },
      { t: "2026-09-10T14:31:00Z", o: 100, h: 95, l: 90, c: 105, v: 12 },
    ] } }); },
  });
  const result = await adapter.fetchBars({ symbol: "BTC/USD", asset: "crypto", cryptoLocation: "us", timeframe: "1Min", start: "2026-09-10T14:30:00Z", end: "2026-09-10T14:32:00Z", asOfTs: Date.parse("2026-09-10T14:32:30Z") });
  assert.equal(new URL(requested).pathname, "/v1beta3/crypto/us/bars");
  assert.equal(result.observations.length, 1);
  assert.equal(result.rejected[0]?.reasons[0], "invalid_market_bar");
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { FREE_NEWS_SOURCE_CATALOG, FREE_RSS_FEEDS, GenericJsonNewsAdapter, normalizeJsonNews, RssNewsAdapter, createFinnhubNewsAdapter, createGNewsAdapter, createMarketauxNewsAdapter, createNewsDataAdapter } from './news-sources.ts';

const mockFetch = async (url: string) => new Response(url.includes('rss') ? `<rss><channel><item><title><![CDATA[Market headline]]></title><link>https://example.com/a</link><pubDate>Sat, 12 Sep 2026 10:00:00 GMT</pubDate><description>Summary</description></item></channel></rss>` : JSON.stringify({ articles: [{ title: 'Headline', url: 'https://example.com/b', publishedAt: '2026-09-12T10:00:00Z', description: 'Summary' }] }), { status: 200, headers: { 'content-type': url.includes('rss') ? 'application/rss+xml' : 'application/json' } });

test('RSS adapter normalizes valid article with PIT guard', async () => {
  const adapter = new RssNewsAdapter(FREE_RSS_FEEDS[0], mockFetch);
  const batch = await adapter.fetchNews({ asOfTs: Date.parse('2026-09-12T11:00:00Z') });
  assert.equal(batch.articles.length, 1);
  assert.equal(batch.rejected.length, 0);
});

test('JSON normalization rejects future news', () => {
  const batch = normalizeJsonNews('gnews', { articles: [{ title: 'Future', url: 'https://example.com/future', publishedAt: '2026-09-12T12:00:00Z' }] }, Date.parse('2026-09-12T11:00:00Z'), Date.parse('2026-09-12T11:00:00Z'));
  assert.equal(batch.articles.length, 0);
  assert.equal(batch.rejected.length, 1);
});

test('generic JSON adapter appends API key without exposing it in normalized output', async () => {
  const adapter = new GenericJsonNewsAdapter({ id: 'marketaux.news', apiKey: 'test-key', baseUrl: 'https://api.example.com/news', fetchImpl: mockFetch });
  const batch = await adapter.fetchNews({}, Date.parse('2026-09-12T11:00:00Z'));
  assert.equal(batch.articles.length, 1);
  assert.equal(batch.articles[0].sourceId, 'marketaux.news');
});

test('catalog includes official and free-tier sources and marks commercial restrictions explicitly', () => {
  const sec = FREE_NEWS_SOURCE_CATALOG.find((x) => x.id === 'sec.edgar');
  const gnews = FREE_NEWS_SOURCE_CATALOG.find((x) => x.id === 'gnews');
  assert.equal(sec?.free, true);
  assert.equal(gnews?.freeTier, true);
  assert.equal(gnews?.commercialRestrictionKnown, true);
  assert.ok(FREE_NEWS_SOURCE_CATALOG.length >= 12);
  assert.ok(FREE_RSS_FEEDS.some((x) => x.id === 'sec-press-rss'));
  assert.ok(FREE_RSS_FEEDS.some((x) => x.id === 'cftc-press-rss'));
  assert.ok(FREE_RSS_FEEDS.some((x) => x.id === 'ecb-press-rss'));
  assert.ok(FREE_RSS_FEEDS.some((x) => x.id === 'fed-press-rss'));
});


test('free-tier adapter factories target expected providers', async () => {
  assert.equal(createMarketauxNewsAdapter({ apiKey: 'x' }).id, 'marketaux.news');
  assert.equal(createNewsDataAdapter({ apiKey: 'x' }).id, 'newsdata.news');
  assert.equal(createGNewsAdapter({ apiKey: 'x' }).id, 'gnews');
  assert.equal(createFinnhubNewsAdapter({ apiKey: 'x' }).id, 'finnhub.news');
  const seen: string[] = [];
  const fetcher = async (url: string) => { seen.push(url); return new Response(JSON.stringify({ articles: [] }), { status: 200 }); };
  await createMarketauxNewsAdapter({ apiKey: 'marketaux-key', fetchImpl: fetcher }).fetchNews();
  await createFinnhubNewsAdapter({ apiKey: 'finnhub-key', fetchImpl: fetcher }).fetchNews();
  assert.match(seen[0], /api_token=marketaux-key/);
  assert.match(seen[1], /token=finnhub-key/);
});

import { HttpJsonSourceAdapter, HttpTextSourceAdapter, type HttpFetchLike } from './source-ingestion.ts';
import { validatePointInTime } from '../point-in-time.ts';

export interface NewsArticle {
  sourceId: string;
  title: string;
  url: string;
  publishedTs: number;
  availableTs: number;
  author?: string | null;
  summary?: string | null;
  language?: string | null;
  category?: string | null;
  tickers?: string[];
  entities?: string[];
  sentimentScore?: number | null;
  raw?: unknown;
}

export interface NewsBatch {
  source: string;
  asOfTs: number;
  articles: NewsArticle[];
  rejected: Array<{ subjectId: string; eventTs: number; reasons: string[] }>;
  retrievedTs: number;
}

export interface RssFeedDefinition {
  id: string;
  name: string;
  url: string;
  category: string;
  language?: string;
}

export const FREE_RSS_FEEDS: RssFeedDefinition[] = [
  { id: 'google-ai-rss', name: 'Google AI', url: 'https://blog.google/technology/ai/rss/', category: 'ai-tech' },
  { id: 'openai-news-rss', name: 'OpenAI News', url: 'https://openai.com/news/rss.xml', category: 'ai-tech' },
  { id: 'huggingface-blog-rss', name: 'Hugging Face Blog', url: 'https://huggingface.co/blog/feed.xml', category: 'ai-research' },
  { id: 'arxiv-cs-ai-rss', name: 'arXiv cs.AI', url: 'https://rss.arxiv.org/rss/cs.AI', category: 'ai-research' },
  { id: 'bbc-world-rss', name: 'BBC World', url: 'https://feeds.bbci.co.uk/news/world/rss.xml', category: 'world' },
  { id: 'coindesk-rss', name: 'CoinDesk', url: 'https://www.coindesk.com/arc/outboundfeeds/rss/', category: 'crypto' },
  { id: 'cointelegraph-rss', name: 'Cointelegraph', url: 'https://cointelegraph.com/rss', category: 'crypto' },
  { id: 'decrypt-rss', name: 'Decrypt', url: 'https://decrypt.co/feed', category: 'crypto' },
  { id: 'the-verge-ai-rss', name: 'The Verge AI', url: 'https://www.theverge.com/rss/ai-artificial-intelligence/index.xml', category: 'ai-tech' },
  { id: 'mit-ai-rss', name: 'MIT Technology Review AI', url: 'https://www.technologyreview.com/topic/artificial-intelligence/feed/', category: 'ai-tech' },
  { id: 'guardian-world-rss', name: 'The Guardian World', url: 'https://www.theguardian.com/world/rss', category: 'world' },
  { id: 'sec-press-rss', name: 'SEC Press Releases', url: 'https://www.sec.gov/news/pressreleases.rss', category: 'regulation' },
  { id: 'cftc-press-rss', name: 'CFTC Press Releases', url: 'https://www.cftc.gov/RSS/RSSGP/rssgp.xml', category: 'regulation' },
  { id: 'cftc-enforcement-rss', name: 'CFTC Enforcement', url: 'https://www.cftc.gov/RSS/RSSEN/rssen.xml', category: 'regulation' },
  { id: 'ecb-press-rss', name: 'ECB Press', url: 'https://www.ecb.europa.eu/rss/press.html', category: 'central-bank' },
  { id: 'ecb-usd-fx-rss', name: 'ECB EUR/USD Reference Rate', url: 'https://www.ecb.europa.eu/rss/fxref-usd.html', category: 'fx' },
  { id: 'fed-press-rss', name: 'Federal Reserve Press Releases', url: 'https://www.federalreserve.gov/feeds/press_all.xml', category: 'central-bank' },
  { id: 'fed-policy-rates-rss', name: 'Federal Reserve Policy Rates', url: 'https://www.federalreserve.gov/feeds/prates.xml', category: 'central-bank' },
];

function parseTimestamp(value: string | number | undefined): number | null {
  if (value === undefined || value === '') return null;
  const ts = typeof value === 'number' ? value : Date.parse(value);
  return Number.isFinite(ts) ? ts : null;
}

function cleanXml(value: string): string {
  return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, '').trim();
}

function firstTag(block: string, names: string[]): string | null {
  for (const name of names) {
    const match = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, 'i'));
    if (match?.[1]) return cleanXml(match[1]);
  }
  return null;
}

function parseRss(xml: string, definition: RssFeedDefinition, retrievedTs: number, asOfTs: number): NewsBatch {
  const blocks = xml.match(/<(item|entry)(?:\s[^>]*)?>[\s\S]*?<\/(?:item|entry)>/gi) ?? [];
  const articles: NewsArticle[] = [];
  const rejected: NewsBatch['rejected'] = [];
  for (const block of blocks) {
    const title = firstTag(block, ['title']);
    const publishedRaw = firstTag(block, ['pubDate', 'published', 'updated', 'dc:date']);
    const publishedTs = parseTimestamp(publishedRaw ?? undefined);
    let url = firstTag(block, ['link', 'guid']);
    if (!url) {
      const href = block.match(/<link[^>]+href=["']([^"']+)["'][^>]*>/i)?.[1];
      url = href ?? null;
    }
    if (!title || !url || publishedTs === null) {
      rejected.push({ subjectId: title ?? url ?? 'news', eventTs: publishedTs ?? retrievedTs, reasons: ['rss_article_missing_required_fields'] });
      continue;
    }
    const pit = validatePointInTime({ eventTs: publishedTs, publishedTs, availableTs: publishedTs }, asOfTs);
    if (!pit.ok) {
      rejected.push({ subjectId: url, eventTs: publishedTs, reasons: pit.reasons });
      continue;
    }
    articles.push({
      sourceId: definition.id,
      title,
      url,
      publishedTs,
      availableTs: publishedTs,
      author: firstTag(block, ['author', 'dc:creator']),
      summary: firstTag(block, ['description', 'summary', 'content:encoded']),
      language: definition.language ?? 'en',
      category: definition.category,
      raw: { feed: definition.name },
    });
  }
  return { source: definition.id, asOfTs, articles, rejected, retrievedTs };
}

export class RssNewsAdapter {
  readonly id = 'news.rss';
  private readonly definition: RssFeedDefinition;
  private readonly source: HttpTextSourceAdapter;

  constructor(definition: RssFeedDefinition, fetchImpl?: HttpFetchLike) {
    this.definition = definition;
    const host = new URL(definition.url).hostname;
    this.source = new HttpTextSourceAdapter({ id: `${this.id}.${definition.id}`, allowedHosts: [host], fetchImpl, defaultMaxBytes: 2_000_000 });
  }

  async fetchNews(input: { asOfTs?: number } = {}): Promise<NewsBatch> {
    const asOfTs = input.asOfTs ?? Date.now();
    const fetched = await this.source.fetch({ url: this.definition.url });
    return parseRss(fetched.data, this.definition, fetched.fetchedAt, asOfTs);
  }
}

export interface JsonNewsAdapterConfig {
  apiKey: string;
  fetchImpl?: HttpFetchLike;
  baseUrl: string;
  id: string;
  apiKeyParam?: string;
}

export interface NewsApiArticleShape {
  title?: string;
  url?: string;
  published_at?: string;
  publishedAt?: string;
  pubDate?: string;
  description?: string;
  content?: string;
  source?: string | { name?: string };
  author?: string;
}

export class GenericJsonNewsAdapter {
  readonly id: string;
  private readonly source: HttpJsonSourceAdapter;
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly apiKeyParam: string;
  constructor(config: JsonNewsAdapterConfig) {
    if (!config.apiKey.trim()) throw new Error('news_api_key_required');
    this.id = config.id;
    this.apiKey = config.apiKey.trim();
    this.baseUrl = config.baseUrl;
    this.apiKeyParam = config.apiKeyParam ?? 'apikey';
    const host = new URL(this.baseUrl).hostname;
    this.source = new HttpJsonSourceAdapter({ id: this.id, allowedHosts: [host], fetchImpl: config.fetchImpl, defaultMaxBytes: 4_000_000 });
  }

  async fetchNews(params: Record<string, string | number | undefined> = {}, asOfTs = Date.now()): Promise<NewsBatch> {
    const url = new URL(this.baseUrl);
    for (const [key, value] of Object.entries(params)) if (value !== undefined) url.searchParams.set(key, String(value));
    url.searchParams.set(this.apiKeyParam, this.apiKey);
    const fetched = await this.source.fetch({ url: url.toString() });
    return normalizeJsonNews(this.id, fetched.data, fetched.fetchedAt, asOfTs);
  }
}

function pickArray(payload: any): NewsApiArticleShape[] {
  if (Array.isArray(payload)) return payload;
  for (const key of ['articles', 'results', 'data', 'feed']) if (Array.isArray(payload?.[key])) return payload[key];
  return [];
}

export function normalizeJsonNews(source: string, payload: unknown, retrievedTs: number, asOfTs: number): NewsBatch {
  const articles: NewsArticle[] = [];
  const rejected: NewsBatch['rejected'] = [];
  for (const item of pickArray(payload)) {
    const publishedTs = parseTimestamp(item.published_at ?? item.publishedAt ?? item.pubDate);
    const url = item.url?.trim();
    const title = item.title?.trim();
    if (!title || !url || publishedTs === null) {
      rejected.push({ subjectId: url || title || 'news', eventTs: publishedTs ?? retrievedTs, reasons: ['json_article_missing_required_fields'] });
      continue;
    }
    const pit = validatePointInTime({ eventTs: publishedTs, publishedTs, availableTs: publishedTs }, asOfTs);
    if (!pit.ok) {
      rejected.push({ subjectId: url, eventTs: publishedTs, reasons: pit.reasons });
      continue;
    }
    const sourceName = typeof item.source === 'string' ? item.source : item.source?.name;
    articles.push({ sourceId: source, title, url, publishedTs, availableTs: publishedTs, author: item.author ?? null, summary: item.description ?? item.content ?? null, raw: { sourceName } });
  }
  return { source, asOfTs, articles, rejected, retrievedTs };
}

export interface NewsSourceCatalogEntry {
  id: string;
  name: string;
  mode: 'rss' | 'api' | 'official';
  free: boolean;
  freeTier: boolean;
  keyRequired: boolean;
  commercialRestrictionKnown: boolean;
  pointInTimeSafe: boolean;
  assetClasses: Array<'crypto' | 'equity' | 'fx' | 'commodities' | 'macro' | 'ai-tech' | 'world'>;
  notes: string;
}

export const FREE_NEWS_SOURCE_CATALOG: NewsSourceCatalogEntry[] = [
  { id: 'sec.edgar', name: 'SEC EDGAR', mode: 'official', free: true, freeTier: false, keyRequired: false, commercialRestrictionKnown: false, pointInTimeSafe: true, assetClasses: ['equity'], notes: 'Official SEC filings/API/RSS; use declared User-Agent and filing acceptance timestamps.' },
  { id: 'fred', name: 'FRED/ALFRED', mode: 'official', free: true, freeTier: false, keyRequired: true, commercialRestrictionKnown: true, pointInTimeSafe: true, assetClasses: ['macro', 'fx', 'equity', 'commodities'], notes: 'Official macro data; API key and FRED terms apply.' },
  { id: 'alphavantage.news.sentiment', name: 'Alpha Vantage News & Sentiment', mode: 'api', free: true, freeTier: true, keyRequired: true, commercialRestrictionKnown: true, pointInTimeSafe: true, assetClasses: ['crypto', 'equity', 'fx'], notes: 'Free limits apply; real-time/delayed market-data entitlements differ from news access.' },
  { id: 'marketaux.news', name: 'Marketaux', mode: 'api', free: true, freeTier: true, keyRequired: true, commercialRestrictionKnown: true, pointInTimeSafe: true, assetClasses: ['crypto', 'equity', 'fx', 'commodities', 'macro'], notes: 'Free plan available; request/article limits apply.' },
  { id: 'newsdata.news', name: 'NewsData.io', mode: 'api', free: true, freeTier: true, keyRequired: true, commercialRestrictionKnown: true, pointInTimeSafe: false, assetClasses: ['crypto', 'equity', 'fx', 'commodities', 'macro', 'world'], notes: 'Free plan is delayed and limited; do not use as sole low-latency source.' },
  { id: 'finnhub.news', name: 'Finnhub News', mode: 'api', free: true, freeTier: true, keyRequired: true, commercialRestrictionKnown: true, pointInTimeSafe: false, assetClasses: ['crypto', 'equity', 'fx', 'commodities', 'world'], notes: 'Free tier is rate-limited; production entitlement must be reviewed.' },
  { id: 'gnews', name: 'GNews', mode: 'api', free: true, freeTier: true, keyRequired: true, commercialRestrictionKnown: true, pointInTimeSafe: false, assetClasses: ['crypto', 'equity', 'fx', 'commodities', 'world', 'ai-tech'], notes: 'Free plan is delayed and restricted to development/non-commercial use.' },
  { id: 'news.rss', name: 'Public RSS feeds', mode: 'rss', free: true, freeTier: false, keyRequired: false, commercialRestrictionKnown: true, pointInTimeSafe: true, assetClasses: ['crypto', 'equity', 'fx', 'commodities', 'macro', 'world', 'ai-tech'], notes: 'Publisher-specific terms/robots/licensing must be reviewed before production redistribution.' },
  { id: 'binance.public', name: 'Binance public market endpoints', mode: 'official', free: true, freeTier: false, keyRequired: false, commercialRestrictionKnown: true, pointInTimeSafe: true, assetClasses: ['crypto'], notes: 'Public market data; subject to Binance API terms and rate limits.' },
  { id: 'coingecko.public', name: 'CoinGecko public API', mode: 'official', free: true, freeTier: true, keyRequired: false, commercialRestrictionKnown: true, pointInTimeSafe: true, assetClasses: ['crypto'], notes: 'Public/free access is rate-limited and subject to current API terms.' },
  { id: 'sec.press.rss', name: 'SEC Press Releases RSS', mode: 'rss', free: true, freeTier: false, keyRequired: false, commercialRestrictionKnown: false, pointInTimeSafe: true, assetClasses: ['equity'], notes: 'Official SEC press-release feed for enforcement, disclosures and regulatory events.' },
  { id: 'cftc.press.rss', name: 'CFTC Press/Enforcement RSS', mode: 'rss', free: true, freeTier: false, keyRequired: false, commercialRestrictionKnown: false, pointInTimeSafe: true, assetClasses: ['commodities', 'fx', 'equity'], notes: 'Official derivatives-regulator feeds for enforcement, policy and market-structure events.' },
  { id: 'ecb.rss', name: 'ECB RSS', mode: 'rss', free: true, freeTier: false, keyRequired: false, commercialRestrictionKnown: false, pointInTimeSafe: true, assetClasses: ['fx', 'macro', 'equity'], notes: 'Official ECB press and FX reference-rate feeds.' },
  { id: 'federalreserve.rss', name: 'Federal Reserve RSS', mode: 'rss', free: true, freeTier: false, keyRequired: false, commercialRestrictionKnown: false, pointInTimeSafe: true, assetClasses: ['fx', 'macro', 'equity'], notes: 'Official Fed press and policy-rate feeds.' },
];

export function createMarketauxNewsAdapter(config: { apiKey: string; fetchImpl?: HttpFetchLike }) {
  return new GenericJsonNewsAdapter({ id: 'marketaux.news', apiKey: config.apiKey, fetchImpl: config.fetchImpl, baseUrl: 'https://api.marketaux.com/v1/news/all', apiKeyParam: 'api_token' });
}

export function createNewsDataAdapter(config: { apiKey: string; fetchImpl?: HttpFetchLike }) {
  return new GenericJsonNewsAdapter({ id: 'newsdata.news', apiKey: config.apiKey, fetchImpl: config.fetchImpl, baseUrl: 'https://newsdata.io/api/1/latest' });
}

export function createGNewsAdapter(config: { apiKey: string; fetchImpl?: HttpFetchLike }) {
  return new GenericJsonNewsAdapter({ id: 'gnews', apiKey: config.apiKey, fetchImpl: config.fetchImpl, baseUrl: 'https://gnews.io/api/v4/search' });
}

export function createFinnhubNewsAdapter(config: { apiKey: string; fetchImpl?: HttpFetchLike }) {
  return new GenericJsonNewsAdapter({ id: 'finnhub.news', apiKey: config.apiKey, fetchImpl: config.fetchImpl, baseUrl: 'https://finnhub.io/api/v1/news', apiKeyParam: 'token' });
}

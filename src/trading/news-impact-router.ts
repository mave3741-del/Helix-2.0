import type { NewsArticle } from './data/news-sources.ts';
import type { TradingWorkerIdentity, TradingWorkerRegistry } from './runtime/worker-registry.ts';
import type { TaskQueue } from './runtime/task-queue.ts';

export type NewsImpactSeverity = 'low' | 'moderate' | 'high' | 'critical';
export type NewsImpactUrgency = 'routine' | 'fast' | 'immediate';
export type NewsImpactDirection = 'bullish' | 'bearish' | 'mixed' | 'neutral';

export interface NewsImpactAssessment {
  articleId: string;
  eventKind: string;
  severity: NewsImpactSeverity;
  urgency: NewsImpactUrgency;
  direction: NewsImpactDirection;
  confidence: number;
  affectedMarkets: string[];
  affectedSymbols: string[];
  councilIds: string[];
  rationale: string[];
}

export interface NewsImpactRoutingResult {
  assessment: NewsImpactAssessment;
  workerIds: string[];
  taskIds: string[];
}

const COUNCILS = {
  macro: 'macro',
  fundamental: 'fundamental',
  technical: 'technical',
  derivatives: 'derivatives',
  crypto: 'crypto',
  news: 'news',
  risk: 'risk',
  execution: 'execution',
  adversarial: 'adversarial',
  knowledge: 'knowledge',
} as const;

const MARKET_ALIASES: Array<[string, string]> = [
  ['crypto', 'crypto'], ['bitcoin', 'crypto'], ['ethereum', 'crypto'], ['btc', 'crypto'], ['eth', 'crypto'],
  ['forex', 'fx'], ['foreign exchange', 'fx'], ['eur/usd', 'fx'], ['usd', 'fx'], ['euro', 'fx'], ['yen', 'fx'],
  ['oil', 'commodities'], ['crude', 'commodities'], ['gold', 'commodities'], ['silver', 'commodities'], ['natural gas', 'commodities'],
  ['treasury', 'rates'], ['bond', 'rates'], ['yield', 'rates'], ['interest rate', 'rates'],
  ['stock', 'equities'], ['stocks', 'equities'], ['shares', 'equities'], ['equity', 'equities'], ['earnings', 'equities'],
];

const BULLISH = ['beats', 'beat expectations', 'raises guidance', 'approval', 'approved', 'cuts rates', 'rate cut', 'stimulus', 'buyback', 'surge', 'record revenue', 'positive'];
const BEARISH = ['misses', 'missed expectations', 'cuts guidance', 'lawsuit', 'fine', 'fraud', 'hack', 'exploit', 'bankruptcy', 'defaults', 'sanctions', 'war', 'rate hike', 'higher rates', 'negative'];
const CRITICAL = ['bankruptcy', 'default', 'war', 'exploit', 'emergency', 'halted', 'liquidation', 'exchange insolvency', 'systemic'];
const FAST = ['fed', 'ecb', 'central bank', 'sec', 'cftc', 'rate decision', 'policy rate', 'enforcement', 'approval', 'hack', 'earnings'];

function textOf(article: NewsArticle): string {
  return `${article.title} ${article.summary ?? ''} ${article.category ?? ''} ${article.entities?.join(' ') ?? ''}`.toLowerCase();
}

function includesAny(text: string, terms: string[]): string[] {
  return terms.filter((term) => text.includes(term));
}

function unique(values: string[]): string[] { return [...new Set(values)]; }

function articleId(article: NewsArticle): string {
  return `${article.sourceId}:${article.publishedTs}:${article.url}`;
}

function inferMarkets(article: NewsArticle, text: string): string[] {
  const markets = new Set<string>();
  for (const [, market] of MARKET_ALIASES) {
    const matched = MARKET_ALIASES.some(([alias, candidate]) => candidate === market && text.includes(alias));
    if (matched) markets.add(market);
  }
  if (article.tickers?.length) markets.add('equities');
  switch (article.category) {
    case 'crypto': markets.add('crypto'); break;
    case 'fx': markets.add('fx'); break;
    case 'central-bank': case 'macro': markets.add('rates'); markets.add('fx'); break;
    case 'regulation': markets.add('equities'); markets.add('crypto'); break;
    case 'world': markets.add('macro'); markets.add('commodities'); break;
    default: break;
  }
  return [...markets].sort();
}

function inferEventKind(article: NewsArticle, text: string): string {
  if (article.category === 'central-bank' || includesAny(text, ['fed', 'ecb', 'central bank', 'policy rate']).length) return 'central_bank_policy';
  if (article.category === 'regulation' || includesAny(text, ['sec', 'cftc', 'enforcement', 'lawsuit', 'approval']).length) return 'regulatory_event';
  if (article.category === 'crypto' || includesAny(text, ['bitcoin', 'ethereum', 'crypto', 'token', 'exchange']).length) return 'crypto_event';
  if (includesAny(text, ['earnings', 'guidance', 'revenue', 'profit', 'acquisition', 'merger']).length) return 'corporate_event';
  if (includesAny(text, ['inflation', 'cpi', 'ppi', 'jobs', 'payrolls', 'gdp', 'unemployment']).length) return 'macro_release';
  if (includesAny(text, ['war', 'sanctions', 'election', 'geopolitical']).length) return 'geopolitical_event';
  return 'market_news';
}

function councilSet(article: NewsArticle, markets: string[], eventKind: string, severity: NewsImpactSeverity): string[] {
  const councils = new Set<string>([COUNCILS.news, COUNCILS.knowledge]);
  if (eventKind === 'central_bank_policy' || eventKind === 'macro_release' || markets.includes('rates') || markets.includes('fx')) councils.add(COUNCILS.macro);
  if (eventKind === 'corporate_event' || markets.includes('equities')) councils.add(COUNCILS.fundamental);
  if (markets.includes('crypto')) councils.add(COUNCILS.crypto);
  if (markets.includes('commodities') || markets.includes('rates') || eventKind === 'central_bank_policy') councils.add(COUNCILS.derivatives);
  if (severity === 'high' || severity === 'critical') councils.add(COUNCILS.risk);
  if (severity === 'critical' || eventKind === 'regulatory_event') councils.add(COUNCILS.adversarial);
  if (markets.length > 1 || severity === 'high' || severity === 'critical') councils.add(COUNCILS.execution);
  if (article.tickers?.length) councils.add(COUNCILS.technical);
  return [...councils];
}

export function assessNewsImpact(article: NewsArticle, asOfTs = Date.now()): NewsImpactAssessment {
  if (article.publishedTs > asOfTs || article.availableTs > asOfTs) throw new Error('future_news_article_not_allowed');
  const text = textOf(article);
  const bullish = includesAny(text, BULLISH);
  const bearish = includesAny(text, BEARISH);
  const criticalHits = includesAny(text, CRITICAL);
  const fastHits = includesAny(text, FAST);
  const eventKind = inferEventKind(article, text);
  const affectedMarkets = inferMarkets(article, text);
  const affectedSymbols = unique((article.tickers ?? []).map((ticker) => ticker.toUpperCase())).sort();
  const severity: NewsImpactSeverity = criticalHits.length >= 2 ? 'critical' : criticalHits.length === 1 ? 'high' : (bullish.length + bearish.length >= 3 ? 'high' : (bullish.length + bearish.length > 0 ? 'moderate' : 'low'));
  const urgency: NewsImpactUrgency = criticalHits.length > 0 ? 'immediate' : fastHits.length > 0 ? 'fast' : 'routine';
  const direction: NewsImpactDirection = bullish.length && bearish.length ? 'mixed' : bullish.length ? 'bullish' : bearish.length ? 'bearish' : 'neutral';
  const confidence = Math.min(0.99, 0.45 + Math.min(0.35, (bullish.length + bearish.length) * 0.08) + (article.tickers?.length ? 0.08 : 0) + (article.category ? 0.06 : 0));
  const rationale = [
    `event_kind=${eventKind}`,
    `matched_positive_terms=${bullish.length}`,
    `matched_negative_terms=${bearish.length}`,
    `affected_markets=${affectedMarkets.join(',') || 'unknown'}`,
    `affected_symbols=${affectedSymbols.join(',') || 'none'}`,
  ];
  if (!affectedMarkets.length) rationale.push('market_mapping_is_uncertain');
  const councils = councilSet(article, affectedMarkets, eventKind, severity);
  return {
    articleId: articleId(article), eventKind, severity, urgency, direction,
    confidence: Math.round(confidence * 1000) / 1000,
    affectedMarkets, affectedSymbols, councilIds: councils, rationale,
  };
}

function familyForCouncil(councilId: string): string | undefined {
  const map: Record<string, string> = {
    macro: 'Macro', fundamental: 'Fundamental', technical: 'Technical', derivatives: 'Derivatives', crypto: 'Crypto',
    news: 'News', risk: 'Risk', execution: 'Execution', adversarial: 'Adversarial', knowledge: 'Knowledge',
  };
  return map[councilId];
}

function marketHint(markets: string[]): string | undefined {
  if (markets.includes('crypto')) return 'crypto';
  if (markets.includes('equities')) return 'equities';
  if (markets.includes('fx')) return 'fx';
  if (markets.includes('commodities')) return 'commodities';
  if (markets.includes('rates')) return 'rates';
  return undefined;
}

export async function routeNewsImpact(
  article: NewsArticle,
  workers: TradingWorkerRegistry,
  queue: TaskQueue,
  asOfTs = Date.now(),
): Promise<NewsImpactRoutingResult> {
  const assessment = assessNewsImpact(article, asOfTs);
  const selected: TradingWorkerIdentity[] = [];
  const targetMarket = marketHint(assessment.affectedMarkets);
  for (const councilId of assessment.councilIds) {
    const candidates = await workers.list({ family: familyForCouncil(councilId), market: targetMarket, availableOnly: true });
    const fallback = candidates.length ? candidates : await workers.list({ family: familyForCouncil(councilId), availableOnly: true });
    const worker = fallback[0];
    if (worker && !selected.some((existing) => existing.workerId === worker.workerId)) selected.push(worker);
    if (selected.length >= 12) break;
  }
  const taskIds: string[] = [];
  for (const worker of selected) {
    const taskId = `news-impact:${assessment.articleId}:${worker.workerId}`;
    const result = await queue.enqueue({
      id: taskId,
      type: 'news.impact.review',
      payload: {
        article,
        assessment,
        workerId: worker.workerId,
        asOfTs,
        instruction: 'Assess event impact and affected markets. Do not treat the article as an automatic trade signal.',
      },
      routing: { preferredWorkerId: worker.workerId, family: worker.family, market: targetMarket, requiredCapability: 'research' },
      priority: assessment.severity === 'critical' ? 1000 : assessment.severity === 'high' ? 800 : assessment.urgency === 'fast' ? 600 : 300,
      maxAttempts: 3,
    });
    if (result.inserted) taskIds.push(taskId);
  }
  return { assessment, workerIds: selected.map((worker) => worker.workerId), taskIds };
}

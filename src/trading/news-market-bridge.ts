import type { NewsImpactAssessment } from './news-impact-router.ts';
import type { MarketScanCandidate, MarketScanResult } from './market-scanner.ts';
import type { TaskQueue } from './runtime/task-queue.ts';

export interface NewsMarketBoostPolicy {
  severityWeight?: Partial<Record<NewsImpactAssessment['severity'], number>>;
  urgencyWeight?: Partial<Record<NewsImpactAssessment['urgency'], number>>;
  directSymbolBoost?: number;
  marketMatchBoost?: number;
  maxBoost?: number;
  candidateLimit?: number;
}

export interface NewsMarketCandidate extends MarketScanCandidate {
  newsBoost: number;
  newsArticleIds: string[];
  newsReasons: string[];
  newsCouncilIds: string[];
}

export interface NewsMarketBridgeResult {
  candidates: NewsMarketCandidate[];
  affectedMarkets: string[];
  affectedSymbols: string[];
  boostedCount: number;
  unroutableNewsCount: number;
}

const DEFAULT_POLICY: Required<NewsMarketBoostPolicy> = {
  severityWeight: { low: 0.02, moderate: 0.06, high: 0.12, critical: 0.20 },
  urgencyWeight: { routine: 0.01, fast: 0.04, immediate: 0.08 },
  directSymbolBoost: 0.20,
  marketMatchBoost: 0.10,
  maxBoost: 0.35,
  candidateLimit: 100,
};

function clamp01(value: number): number { return Math.max(0, Math.min(1, value)); }
function unique(values: string[]): string[] { return [...new Set(values)]; }

function normalizedMarket(candidate: MarketScanCandidate): string {
  const market = String(candidate.market).toLowerCase();
  if (market.includes('crypto')) return 'crypto';
  if (market.includes('equity') || market.includes('stock')) return 'equities';
  if (market.includes('fx') || market.includes('forex')) return 'fx';
  if (market.includes('commodit')) return 'commodities';
  if (market.includes('rate') || market.includes('bond')) return 'rates';
  return market;
}

function assessmentMarketMatches(candidate: MarketScanCandidate, assessment: NewsImpactAssessment): boolean {
  const target = normalizedMarket(candidate);
  return assessment.affectedMarkets.some((market) => market.toLowerCase() === target);
}

export function applyNewsImpactToScan(
  scan: MarketScanResult,
  assessments: NewsImpactAssessment[],
  policy: NewsMarketBoostPolicy = {},
): NewsMarketBridgeResult {
  const p = { ...DEFAULT_POLICY, ...policy, severityWeight: { ...DEFAULT_POLICY.severityWeight, ...policy.severityWeight }, urgencyWeight: { ...DEFAULT_POLICY.urgencyWeight, ...policy.urgencyWeight } };
  const base = scan.candidates;
  const affectedMarkets = unique(assessments.flatMap((a) => a.affectedMarkets)).sort();
  const affectedSymbols = unique(assessments.flatMap((a) => a.affectedSymbols.map((s) => s.toUpperCase()))).sort();
  const routable = assessments.filter((a) => a.affectedMarkets.length || a.affectedSymbols.length);
  const candidates = base.map((candidate): NewsMarketCandidate => {
    const symbol = candidate.symbol.toUpperCase();
    const matched = assessments.filter((assessment) =>
      assessment.affectedSymbols.includes(symbol) || assessmentMarketMatches(candidate, assessment),
    );
    let boost = 0;
    const reasons: string[] = [];
    for (const assessment of matched) {
      boost += p.severityWeight[assessment.severity] ?? 0;
      boost += p.urgencyWeight[assessment.urgency] ?? 0;
      if (assessment.affectedSymbols.includes(symbol)) {
        boost += p.directSymbolBoost;
        reasons.push(`direct-symbol:${assessment.eventKind}`);
      } else if (assessmentMarketMatches(candidate, assessment)) {
        boost += p.marketMatchBoost;
        reasons.push(`market-match:${assessment.eventKind}`);
      }
      if (assessment.urgency === 'immediate') reasons.push('immediate-event');
      if (assessment.severity === 'critical' || assessment.severity === 'high') reasons.push(`${assessment.severity}-event`);
    }
    boost = clamp01(Math.min(boost, p.maxBoost));
    return {
      ...candidate,
      score: clamp01(candidate.score + boost),
      newsBoost: boost,
      newsArticleIds: matched.map((assessment) => assessment.articleId).sort(),
      newsReasons: unique(reasons).sort(),
      newsCouncilIds: unique(matched.flatMap((assessment) => assessment.councilIds)).sort(),
      reasons: unique([...candidate.reasons, ...reasons]).sort(),
    };
  }).sort((a, b) => b.score - a.score || b.newsBoost - a.newsBoost || `${a.venue}:${a.symbol}`.localeCompare(`${b.venue}:${b.symbol}`)).slice(0, p.candidateLimit);
  return { candidates, affectedMarkets, affectedSymbols, boostedCount: candidates.filter((c) => c.newsBoost > 0).length, unroutableNewsCount: assessments.length - routable.length };
}

export async function enqueueNewsAwareCandidates(
  result: NewsMarketBridgeResult,
  queue: TaskQueue,
  scanId: string,
  now = Date.now(),
): Promise<number> {
  let inserted = 0;
  for (const candidate of result.candidates) {
    const taskId = `${scanId}:news-aware:${candidate.venue}:${candidate.symbol}`;
    const outcome = await queue.enqueue({
      id: taskId,
      type: 'market-news-aware-analysis',
      payload: {
        scanId,
        candidate,
        newsArticleIds: candidate.newsArticleIds,
        newsBoost: candidate.newsBoost,
        asOfTs: now,
        instruction: 'Use news as evidence. Require point-in-time validation and independent risk review before any trade decision.',
      },
      routing: { market: candidate.market, family: 'market-research', requiredCapability: 'market-analysis' },
      priority: Math.round(candidate.score * 1000),
      availableAt: now,
      maxAttempts: 4,
    });
    if (outcome.inserted) inserted += 1;
  }
  return inserted;
}

import type { NewsImpactAssessment } from './news-impact-router.ts';
import type { NewsMarketCandidate } from './news-market-bridge.ts';

export interface CrossMarketPropagationPolicy {
  maxHops?: number;
  decayPerHop?: number;
  maxPropagatedBoost?: number;
  maxRelatedTargetsPerSeed?: number;
  minConfidence?: number;
}

export interface CrossMarketTarget {
  symbol: string;
  market: string;
  relation: string;
  hop: number;
  confidence: number;
}

export interface PropagatedNewsCandidate extends NewsMarketCandidate {
  propagationBoost: number;
  propagationSources: string[];
  propagationReasons: string[];
  newsCouncilIds: string[];
}

export interface CrossMarketPropagationResult {
  candidates: PropagatedNewsCandidate[];
  propagatedTargets: CrossMarketTarget[];
  propagatedCount: number;
}

const DEFAULT_POLICY: Required<CrossMarketPropagationPolicy> = {
  maxHops: 2,
  decayPerHop: 0.55,
  maxPropagatedBoost: 0.18,
  maxRelatedTargetsPerSeed: 12,
  minConfidence: 0.45,
};

const EVENT_LINKS: Record<string, CrossMarketTarget[]> = {
  central_bank_policy: [
    { symbol: 'SPY', market: 'equity', relation: 'broad-equity', hop: 1, confidence: 0.72 },
    { symbol: 'QQQ', market: 'equity', relation: 'growth-equity', hop: 1, confidence: 0.76 },
    { symbol: 'TLT', market: 'rates', relation: 'long-duration-rates', hop: 1, confidence: 0.88 },
    { symbol: 'GLD', market: 'commodities', relation: 'gold-rate-sensitive', hop: 1, confidence: 0.70 },
    { symbol: 'UUP', market: 'fx', relation: 'usd-rates', hop: 1, confidence: 0.78 },
    { symbol: 'BTCUSD', market: 'crypto', relation: 'liquidity-risk', hop: 2, confidence: 0.50 },
  ],
  macro_release: [
    { symbol: 'SPY', market: 'equity', relation: 'broad-equity', hop: 1, confidence: 0.68 },
    { symbol: 'QQQ', market: 'equity', relation: 'growth-equity', hop: 1, confidence: 0.68 },
    { symbol: 'TLT', market: 'rates', relation: 'rates-duration', hop: 1, confidence: 0.74 },
    { symbol: 'UUP', market: 'fx', relation: 'usd-macro', hop: 1, confidence: 0.62 },
    { symbol: 'GLD', market: 'commodities', relation: 'macro-hedge', hop: 1, confidence: 0.58 },
  ],
  regulatory_event: [
    { symbol: 'SPY', market: 'equity', relation: 'regulatory-risk', hop: 1, confidence: 0.48 },
    { symbol: 'QQQ', market: 'equity', relation: 'regulatory-risk', hop: 1, confidence: 0.48 },
    { symbol: 'BTCUSD', market: 'crypto', relation: 'digital-asset-regulation', hop: 1, confidence: 0.82 },
  ],
  crypto_event: [
    { symbol: 'BTCUSD', market: 'crypto', relation: 'crypto-beta', hop: 1, confidence: 0.92 },
    { symbol: 'ETHUSD', market: 'crypto', relation: 'crypto-beta', hop: 1, confidence: 0.84 },
    { symbol: 'COIN', market: 'equity', relation: 'crypto-equity', hop: 1, confidence: 0.76 },
    { symbol: 'MSTR', market: 'equity', relation: 'bitcoin-equity', hop: 1, confidence: 0.74 },
  ],
  corporate_event: [
    { symbol: 'SPY', market: 'equity', relation: 'index-readthrough', hop: 1, confidence: 0.46 },
    { symbol: 'QQQ', market: 'equity', relation: 'growth-index-readthrough', hop: 1, confidence: 0.50 },
  ],
};

function clamp01(value: number): number { return Math.max(0, Math.min(1, value)); }
function unique(values: string[]): string[] { return [...new Set(values)]; }

function directCandidate(candidate: NewsMarketCandidate, assessment: NewsImpactAssessment): boolean {
  const symbol = candidate.symbol.toUpperCase();
  return assessment.affectedSymbols.some((target) => target.toUpperCase() === symbol)
    || assessment.affectedMarkets.some((market) => market.toLowerCase() === candidate.market.toLowerCase());
}

function seedTargets(assessment: NewsImpactAssessment, policy: Required<CrossMarketPropagationPolicy>): CrossMarketTarget[] {
  const bySymbol = new Map<string, CrossMarketTarget>();
  for (const target of [...(EVENT_LINKS[assessment.eventKind] ?? [])]) {
    if (target.confidence < policy.minConfidence || target.hop > policy.maxHops) continue;
    const key = target.symbol.toUpperCase();
    const current = bySymbol.get(key);
    if (!current || target.confidence > current.confidence) bySymbol.set(key, { ...target });
  }
  return [...bySymbol.values()]
    .sort((a, b) => b.confidence - a.confidence || a.symbol.localeCompare(b.symbol))
    .slice(0, policy.maxRelatedTargetsPerSeed);
}

export function propagateNewsAcrossMarkets(
  candidates: NewsMarketCandidate[],
  assessments: NewsImpactAssessment[],
  policy: CrossMarketPropagationPolicy = {},
): CrossMarketPropagationResult {
  const p = { ...DEFAULT_POLICY, ...policy };
  const propagatedTargets: CrossMarketTarget[] = [];
  const targetsBySymbol = new Map<string, CrossMarketTarget[]>();

  for (const assessment of assessments) {
    for (const target of seedTargets(assessment, p)) {
      propagatedTargets.push(target);
      const current = targetsBySymbol.get(target.symbol.toUpperCase()) ?? [];
      current.push(target);
      targetsBySymbol.set(target.symbol.toUpperCase(), current);
    }
  }

  const result = candidates.map((candidate): PropagatedNewsCandidate => {
    const symbol = candidate.symbol.toUpperCase();
    const direct = assessments.filter((assessment) => directCandidate(candidate, assessment));
    const targets = targetsBySymbol.get(symbol) ?? [];
    let boost = 0;
    const reasons: string[] = [];
    const sources: string[] = [];
    for (const target of targets) {
      const hopDecay = Math.pow(p.decayPerHop, Math.max(0, target.hop - 1));
      boost += 0.12 * target.confidence * hopDecay;
      reasons.push(`propagated:${target.relation}:hop-${target.hop}`);
      sources.push(target.symbol);
    }
    // Do not double-count targets that are already direct news matches.
    if (direct.length) boost *= 0.35;
    boost = clamp01(Math.min(boost, p.maxPropagatedBoost));
    return {
      ...candidate,
      score: clamp01(candidate.score + boost),
      propagationBoost: boost,
      propagationSources: unique(sources).sort(),
      propagationReasons: unique(reasons).sort(),
      reasons: unique([...candidate.reasons, ...reasons]).sort(),
    };
  }).sort((a, b) => b.score - a.score || b.propagationBoost - a.propagationBoost || `${a.venue}:${a.symbol}`.localeCompare(`${b.venue}:${b.symbol}`));

  return { candidates: result, propagatedTargets, propagatedCount: result.filter((candidate) => candidate.propagationBoost > 0).length };
}

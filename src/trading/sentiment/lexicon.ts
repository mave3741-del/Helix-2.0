// Small, dependency-free sentiment scorer for short social posts (Reddit
// comments, tweets). Not as nuanced as an LLM call, but free, instant, and
// good enough to rank/aggregate hundreds of posts. Score range: -1..1.

const POSITIVE_WORDS = new Set([
  "bullish", "moon", "mooning", "pump", "pumping", "breakout", "rally", "surge",
  "long", "buy", "buying", "undervalued", "strong", "beat", "beats", "outperform",
  "upgrade", "upgraded", "growth", "profit", "gain", "gains", "winning", "win",
  "green", "up", "soar", "soaring", "rocket", "good", "great", "excellent",
  "positive", "optimistic", "confident", "accumulate", "accumulating", "hodl",
  "support", "recovery", "recovering", "beat estimates", "record high",
]);

const NEGATIVE_WORDS = new Set([
  "bearish", "dump", "dumping", "crash", "crashing", "sell", "selling", "short",
  "shorting", "overvalued", "weak", "miss", "misses", "downgrade", "downgraded",
  "decline", "loss", "losses", "losing", "red", "down", "plunge", "plunging",
  "rug", "rugpull", "scam", "fraud", "bad", "terrible", "awful", "negative",
  "pessimistic", "panic", "fear", "capitulation", "resistance", "recession",
  "bankrupt", "bankruptcy", "delist", "delisted", "hack", "hacked", "exploit",
]);

const NEGATION_WORDS = new Set(["not", "no", "never", "isn't", "wasn't", "won't", "don't", "doesn't", "n't"]);

export type SentimentResult = {
  score: number; // -1 (very negative) .. 1 (very positive)
  magnitude: number; // 0..1, how much signal was found at all
  positiveHits: number;
  negativeHits: number;
};

export function scoreSentiment(text: string): SentimentResult {
  const tokens = text
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^a-z0-9'\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  let positive = 0;
  let negative = 0;

  for (let i = 0; i < tokens.length; i += 1) {
    const word = tokens[i];
    const negatedBefore = i > 0 && NEGATION_WORDS.has(tokens[i - 1]);
    if (POSITIVE_WORDS.has(word)) {
      if (negatedBefore) negative += 1;
      else positive += 1;
    } else if (NEGATIVE_WORDS.has(word)) {
      if (negatedBefore) positive += 1;
      else negative += 1;
    }
  }

  const total = positive + negative;
  const score = total === 0 ? 0 : (positive - negative) / total;
  const magnitude = Math.min(1, total / 6);

  return { score: Number(score.toFixed(3)), magnitude: Number(magnitude.toFixed(3)), positiveHits: positive, negativeHits: negative };
}

export type AggregateSentiment = {
  averageScore: number;
  sampleSize: number;
  bullish: number;
  bearish: number;
  neutral: number;
  label: "bullish" | "bearish" | "neutral" | "mixed";
};

export function aggregateSentiment(texts: string[]): AggregateSentiment {
  const scored = texts.map(scoreSentiment).filter((s) => s.magnitude > 0);
  const sampleSize = scored.length;
  if (sampleSize === 0) {
    return { averageScore: 0, sampleSize: 0, bullish: 0, bearish: 0, neutral: 0, label: "neutral" };
  }
  const averageScore = Number((scored.reduce((sum, s) => sum + s.score, 0) / sampleSize).toFixed(3));
  const bullish = scored.filter((s) => s.score > 0.15).length;
  const bearish = scored.filter((s) => s.score < -0.15).length;
  const neutral = sampleSize - bullish - bearish;
  let label: AggregateSentiment["label"] = "neutral";
  if (bullish > bearish * 1.4) label = "bullish";
  else if (bearish > bullish * 1.4) label = "bearish";
  else if (bullish > 0 && bearish > 0) label = "mixed";
  return { averageScore, sampleSize, bullish, bearish, neutral, label };
}

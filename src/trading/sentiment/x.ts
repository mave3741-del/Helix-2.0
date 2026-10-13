// X (Twitter) sentiment source. X closed its free read tier in Feb 2026 —
// every read now costs money on X's side (~$0.005/post). This module keeps
// calls small and explicit; it's never called unless the owner asks and has
// a bearer token configured, and there's no autonomous/repeating path here.
//
// Goes through the same governed-source gate as the rest of HELIX's external
// data ('x.api' was already registered in external-intelligence.ts with its
// allowed host) instead of running a second, ungoverned check.
import { assertAdapterAdmitted } from "@/trading/data/external-intelligence";
import { aggregateSentiment, scoreSentiment, type AggregateSentiment } from "./lexicon";

export type XPost = {
  id: string;
  text: string;
  createdAt: string;
  likeCount: number;
  repostCount: number;
};

const MAX_RESULTS = 25; // keeps each search call's cost small and predictable

export async function searchRecentPosts(bearerToken: string, query: string, maxResults = MAX_RESULTS): Promise<XPost[]> {
  const capped = Math.min(Math.max(maxResults, 10), MAX_RESULTS);
  const url = new URL("https://api.x.com/2/tweets/search/recent");
  url.searchParams.set("query", `${query} -is:retweet lang:en`);
  url.searchParams.set("max_results", String(capped));
  url.searchParams.set("tweet.fields", "created_at,public_metrics");
  assertAdapterAdmitted("x.api", "x.api", url.toString());

  const res = await fetch(url, { headers: { Authorization: `Bearer ${bearerToken}` } });
  if (!res.ok) {
    if (res.status === 429) throw new Error("X rate limit hit — try again shortly");
    throw new Error(`X search failed (${res.status})`);
  }
  const body = (await res.json()) as {
    data?: Array<{ id: string; text: string; created_at: string; public_metrics?: { like_count?: number; retweet_count?: number } }>;
  };
  return (body.data ?? []).map((t) => ({
    id: t.id,
    text: t.text,
    createdAt: t.created_at,
    likeCount: t.public_metrics?.like_count ?? 0,
    repostCount: t.public_metrics?.retweet_count ?? 0,
  }));
}

export type XSentimentReport = {
  query: string;
  posts: Array<XPost & { sentiment: ReturnType<typeof scoreSentiment> }>;
  aggregate: AggregateSentiment;
  estimatedCostUsd: number;
};

export async function xSentiment(bearerToken: string, query: string, maxResults = MAX_RESULTS): Promise<XSentimentReport> {
  const posts = await searchRecentPosts(bearerToken, query, maxResults);
  const scoredPosts = posts.map((p) => ({ ...p, sentiment: scoreSentiment(p.text) }));
  const aggregate = aggregateSentiment(posts.map((p) => p.text));
  return { query, posts: scoredPosts, aggregate, estimatedCostUsd: Number((posts.length * 0.005).toFixed(3)) };
}

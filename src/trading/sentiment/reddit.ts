// Reddit sentiment source. Uses OAuth2 client-credentials grant — this is
// Reddit's free, app-only auth mode: no user login, no password, just the
// client ID + secret from a "script" app registered at
// reddit.com/prefs/apps. Free tier is 100 requests/minute for personal use.
//
// Reddit killed unauthenticated .json access in May 2026, so OAuth is the
// only working path now — this module never tries the old trick.
//
// Goes through the same governed-source gate the rest of HELIX's external
// data already declares (src/trading/data/external-intelligence.ts) —
// 'reddit.api' was already registered there with its allowed hosts; this
// just enforces it rather than duplicating a second check.
import { assertAdapterAdmitted } from "@/trading/data/external-intelligence";
import { aggregateSentiment, scoreSentiment, type AggregateSentiment } from "./lexicon";

const USER_AGENT = "helix-trading-intelligence/1.0 (sentiment research bot)";

type TokenCache = { token: string; expiresAt: number } | null;
let tokenCache: TokenCache = null;

async function getAccessToken(clientId: string, clientSecret: string): Promise<string> {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 10_000) return tokenCache.token;

  const tokenUrl = "https://www.reddit.com/api/v1/access_token";
  assertAdapterAdmitted("reddit.api", "reddit.api", tokenUrl);
  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": USER_AGENT,
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw new Error(`Reddit auth failed (${res.status}) — check the client ID/secret in Brains.`);
  const body = (await res.json()) as { access_token: string; expires_in: number };
  tokenCache = { token: body.access_token, expiresAt: Date.now() + body.expires_in * 1000 };
  return body.access_token;
}

export type RedditPost = {
  id: string;
  subreddit: string;
  title: string;
  text: string;
  score: number;
  numComments: number;
  createdAt: number;
  permalink: string;
};

const SUBREDDIT_RE = /^[a-zA-Z0-9_]{2,24}$/;

export async function fetchSubredditPosts(
  clientId: string,
  clientSecret: string,
  subreddit: string,
  limit = 25,
): Promise<RedditPost[]> {
  if (!SUBREDDIT_RE.test(subreddit)) throw new Error("Invalid subreddit name");
  const capped = Math.min(Math.max(limit, 1), 50);
  const token = await getAccessToken(clientId, clientSecret);

  const url = `https://oauth.reddit.com/r/${subreddit}/hot?limit=${capped}`;
  assertAdapterAdmitted("reddit.api", "reddit.api", url);
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, "User-Agent": USER_AGENT },
  });
  if (!res.ok) throw new Error(`Reddit fetch failed (${res.status})`);
  const body = (await res.json()) as { data: { children: Array<{ data: Record<string, unknown> }> } };

  return body.data.children.map((c) => {
    const d = c.data;
    return {
      id: String(d.id ?? ""),
      subreddit: String(d.subreddit ?? subreddit),
      title: String(d.title ?? ""),
      text: String(d.selftext ?? ""),
      score: Number(d.score ?? 0),
      numComments: Number(d.num_comments ?? 0),
      createdAt: Number(d.created_utc ?? 0) * 1000,
      permalink: `https://reddit.com${d.permalink ?? ""}`,
    };
  });
}

export type RedditSentimentReport = {
  subreddit: string;
  posts: Array<RedditPost & { sentiment: ReturnType<typeof scoreSentiment> }>;
  aggregate: AggregateSentiment;
};

export async function redditSentiment(
  clientId: string,
  clientSecret: string,
  subreddit: string,
  limit = 25,
): Promise<RedditSentimentReport> {
  const posts = await fetchSubredditPosts(clientId, clientSecret, subreddit, limit);
  const scoredPosts = posts.map((p) => ({ ...p, sentiment: scoreSentiment(`${p.title} ${p.text}`) }));
  const aggregate = aggregateSentiment(posts.map((p) => `${p.title} ${p.text}`));
  return { subreddit, posts: scoredPosts, aggregate };
}

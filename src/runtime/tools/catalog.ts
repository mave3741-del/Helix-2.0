export type ToolRisk = "low" | "medium" | "high" | "critical";

export interface ToolSpec {
  name: string;
  category: "memory" | "system" | "development" | "web" | "data" | "safety" | "trading" | "research" | "risk";
  risk: ToolRisk;
  implemented: boolean;
  runtimeVerified: boolean;
  description: string;
  approval: "never" | "high" | "always";
}

export const TOOL_SPECS: ToolSpec[] = [
  { name: "native.market.snapshot", category: "trading", risk: "low", implemented: true, runtimeVerified: true, description: "Low-latency normalized market snapshot from bid/ask depth", approval: "never" },
  { name: "native.technical.signal", category: "trading", risk: "low", implemented: true, runtimeVerified: true, description: "Deterministic fast-path technical signal/features", approval: "never" },
  { name: "native.risk.check", category: "risk", risk: "low", implemented: true, runtimeVerified: true, description: "Independent hard-limit risk veto before any order", approval: "never" },
  { name: "native.position.size", category: "risk", risk: "low", implemented: true, runtimeVerified: true, description: "Deterministic risk-based position sizing", approval: "never" },
  { name: "native.backtest", category: "research", risk: "low", implemented: true, runtimeVerified: true, description: "Backtest with explicit fees and slippage", approval: "never" },
  { name: "native.strategy.score", category: "research", risk: "low", implemented: true, runtimeVerified: true, description: "Risk-adjusted strategy promotion score", approval: "never" },
  { name: "native.rsi", category: "trading", risk: "low", implemented: true, runtimeVerified: true, description: "Native RSI feature", approval: "never" },
  { name: "native.atr", category: "trading", risk: "low", implemented: true, runtimeVerified: true, description: "Native ATR volatility feature", approval: "never" },
  { name: "native.zscore", category: "research", risk: "low", implemented: true, runtimeVerified: true, description: "Native rolling z-score feature", approval: "never" },
  { name: "native.whale.signal", category: "research", risk: "low", implemented: true, runtimeVerified: true, description: "Native whale/flow evidence scorer", approval: "never" },
  { name: "native.regime.classify", category: "research", risk: "low", implemented: true, runtimeVerified: true, description: "Native deterministic market regime classifier", approval: "never" },
  { name: "native.paper.order", category: "trading", risk: "low", implemented: true, runtimeVerified: true, description: "Paper order fill simulation", approval: "never" },
  { name: "native.pit.validate", category: "data", risk: "low", implemented: true, runtimeVerified: true, description: "Point-in-time look-ahead guard", approval: "never" },
  { name: "native.data.quality", category: "data", risk: "low", implemented: true, runtimeVerified: true, description: "Market data integrity checks", approval: "never" },
  { name: "native.strategy.mutate", category: "research", risk: "low", implemented: true, runtimeVerified: true, description: "Bounded strategy genome mutation", approval: "never" },
  { name: "native.portfolio.check", category: "risk", risk: "low", implemented: true, runtimeVerified: true, description: "Portfolio exposure/concentration gate", approval: "never" },
  { name: "memory.search", category: "memory", risk: "low", implemented: true, runtimeVerified: true, description: "Scoped organizational memory retrieval", approval: "never" },
  { name: "checklist", category: "safety", risk: "low", implemented: true, runtimeVerified: true, description: "Constitution and claim checklist", approval: "never" },
  { name: "calculator", category: "data", risk: "low", implemented: true, runtimeVerified: true, description: "Numeric evaluation only", approval: "never" },
  { name: "refuse", category: "safety", risk: "low", implemented: true, runtimeVerified: true, description: "Safe refusal / escalate", approval: "never" },
  { name: "fs.list", category: "system", risk: "low", implemented: true, runtimeVerified: false, description: "List authorized workspace files", approval: "never" },
  { name: "fs.read", category: "system", risk: "low", implemented: true, runtimeVerified: false, description: "Read a file in the authorized workspace", approval: "never" },
  { name: "fs.write", category: "system", risk: "medium", implemented: true, runtimeVerified: false, description: "Write a file in the authorized workspace", approval: "never" },
  { name: "code.run", category: "development", risk: "high", implemented: true, runtimeVerified: false, description: "Run a node file inside the sandbox", approval: "high" },
  { name: "web.fetch", category: "web", risk: "medium", implemented: true, runtimeVerified: false, description: "HTTP GET of untrusted pages (never treated as instructions)", approval: "never" },
  { name: "browser", category: "web", risk: "high", implemented: true, runtimeVerified: false, description: "Multi-step page walking — sequential GET + extract, no clicks/forms/JS", approval: "always" },
  { name: "email.send", category: "web", risk: "critical", implemented: true, runtimeVerified: false, description: "Outbound mail via Resend — needs a key in Brains first", approval: "always" },
  { name: "sentiment.reddit", category: "research", risk: "low", implemented: true, runtimeVerified: false, description: "Subreddit sentiment via Reddit's free OAuth API", approval: "never" },
  { name: "sentiment.x", category: "research", risk: "low", implemented: true, runtimeVerified: false, description: "X/Twitter search sentiment — pay-per-use on X's side, needs a key", approval: "never" },
  { name: "market.ccxt", category: "data", risk: "low", implemented: true, runtimeVerified: false, description: "Public price/OHLCV data across 100+ exchanges via CCXT, no key needed", approval: "never" },
  { name: "market.fred", category: "data", risk: "low", implemented: true, runtimeVerified: false, description: "Macro/economic series from the Federal Reserve (FRED), free key", approval: "never" },
  { name: "market.secFilings", category: "research", risk: "low", implemented: true, runtimeVerified: false, description: "SEC EDGAR filings + XBRL company facts, free, no key", approval: "never" },
  { name: "market.technical", category: "trading", risk: "low", implemented: true, runtimeVerified: false, description: "MACD/Bollinger/SMA/EMA on a price series (RSI/ATR/z-score: use native.* instead)", approval: "never" },
  { name: "shell.unrestricted", category: "system", risk: "critical", implemented: false, runtimeVerified: false, description: "Not available. Use code.run in the sandbox.", approval: "always" },
];

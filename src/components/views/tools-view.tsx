import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel, PanelTitle } from "@/components/ui/panel";
import { runAuthorizedTool } from "@/runtime/tools/server";
import { TOOL_SPECS } from "@/runtime/tools/catalog";
import { useOrgStore } from "@/store/org-store";

export function ToolsView() {
  const epoch = useOrgStore((s) => s.epoch);
  const toolRuns = useOrgStore((s) => s.runtime?.toolRuns ?? 0);
  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState("https://example.com");
  void epoch;

  async function run(label: string, job: Parameters<typeof runAuthorizedTool>[0]["data"]) {
    setBusy(true);
    try {
      const res = await runAuthorizedTool({ data: job });
      const line = `${res.ok ? "PASS" : "FAIL"} ${label}: ${res.output.slice(0, 280)}`;
      setLog((prev) => [line, ...prev].slice(0, 12));
      useOrgStore.getState().recordTool(res.ok, res.evidence, res.output);
    } catch (e) {
      setLog((prev) => [`FAIL ${label}: ${e instanceof Error ? e.message : "error"}`, ...prev].slice(0, 12));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="font-mono text-[11px] tracking-[0.2em] text-muted uppercase">Tool runtime</p>
        <h1 className="mt-1 text-3xl font-medium tracking-tight">Authorized work, not unrestricted shell.</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Tools run in a sandbox workspace. Unimplemented tools are labeled as such. Web pages are
          untrusted data, never instructions. {toolRuns} recorded runs this session.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {TOOL_SPECS.map((t) => (
          <Panel key={t.name}>
            <div className="flex items-start justify-between gap-2">
              <PanelTitle kicker={t.category} title={t.name} />
              <Badge tone={!t.implemented ? "danger" : t.runtimeVerified || toolRuns > 0 && t.implemented ? "ok" : "live"}>
                {!t.implemented ? "architecture" : t.runtimeVerified ? "runtime-verified" : "implemented"}
              </Badge>
            </div>
            <p className="text-sm text-muted">{t.description}</p>
            <p className="mt-2 font-mono text-[11px] text-muted">
              risk {t.risk} · approval {t.approval}
            </p>
          </Panel>
        ))}
      </div>

      <Panel>
        <PanelTitle kicker="Authorized workspace" title="Run a real coding task" />
        <p className="text-sm text-muted">
          Writes Fibonacci source and tests into the sandbox, then executes them. Success is whatever
          the test process actually returns — not a hardcoded green badge.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button disabled={busy} onClick={() => void run("fibonacci", { name: "coding.fibonacci" })}>
            Run Fibonacci project
          </Button>
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => void run("list", { name: "fs.list", path: "." })}
          >
            List workspace
          </Button>
        </div>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" />
          <Button
            variant="secondary"
            disabled={busy || !url.trim()}
            onClick={() => void run("fetch", { name: "web.fetch", url: url.trim() })}
          >
            Fetch as untrusted data
          </Button>
        </div>
        {log.length ? (
          <ul className="mt-4 space-y-2 font-mono text-xs text-muted">
            {log.map((line, i) => (
              <li key={i} className="rounded-md bg-card-elevated px-3 py-2 whitespace-pre-wrap">
                {line}
              </li>
            ))}
          </ul>
        ) : null}
      </Panel>

      <Panel>
        <PanelTitle kicker="Web · risk high · approval always" title="Walk a few pages" />
        <p className="text-sm text-muted">
          Sequential GET requests only — no clicks, no forms, no JS-rendered content. One URL per line, up to 5.
        </p>
        <BrowserPanel busy={busy} onRun={run} />
      </Panel>

      <Panel>
        <PanelTitle kicker="Web · risk critical · approval always" title="Send an email" />
        <p className="text-sm text-muted">
          Needs a Resend key first — add one under Settings → Brains → Providers → "Resend (email)".
        </p>
        <EmailPanel busy={busy} onRun={run} />
      </Panel>

      <Panel>
        <PanelTitle kicker="Research · risk low · approval never · free" title="Reddit sentiment" />
        <p className="text-sm text-muted">
          Needs a Reddit Client ID in Brains (free, personal-use OAuth) — plus REDDIT_CLIENT_SECRET as an env var.
        </p>
        <RedditPanel busy={busy} onRun={run} />
      </Panel>

      <Panel>
        <PanelTitle kicker="Research · risk low · approval never · pay-per-use" title="X sentiment" />
        <p className="text-sm text-muted">
          Needs a bearer token in Brains. X charges ~$0.005 per post read since Feb 2026 — optional, skip if you don't need it.
        </p>
        <XPanel busy={busy} onRun={run} />
      </Panel>

      <Panel>
        <PanelTitle kicker="Data · risk low · approval never · free, no key" title="Market data (CCXT)" />
        <p className="text-sm text-muted">Public price data across 100+ exchanges — Binance, Coinbase, Kraken, Bybit, OKX, Bitstamp, Gemini.</p>
        <CcxtPanel busy={busy} onRun={run} />
      </Panel>

      <Panel>
        <PanelTitle kicker="Data · risk low · approval never · free" title="Macro data (FRED)" />
        <p className="text-sm text-muted">Needs a free key in Brains → "FRED (macro data)". Try FEDFUNDS, CPIAUCSL, UNRATE, GDP, DGS10.</p>
        <FredPanel busy={busy} onRun={run} />
      </Panel>

      <Panel>
        <PanelTitle kicker="Research · risk low · approval never · free, no key" title="SEC filings" />
        <p className="text-sm text-muted">Needs SEC_EDGAR_CONTACT_EMAIL set as an env var (SEC requires a real contact, not a key).</p>
        <SecPanel busy={busy} onRun={run} />
      </Panel>

      <Panel>
        <PanelTitle kicker="Trading · risk low · approval never · free, no key" title="Technical indicators" />
        <p className="text-sm text-muted">MACD/Bollinger/SMA/EMA on a comma-separated price series. (RSI/ATR/z-score already exist as native.* tools — not duplicated here.)</p>
        <TechnicalPanel busy={busy} onRun={run} />
      </Panel>
    </div>
  );
}

function FredPanel({
  busy,
  onRun,
}: {
  busy: boolean;
  onRun: (label: string, job: Parameters<typeof runAuthorizedTool>[0]["data"]) => Promise<void>;
}) {
  const [seriesId, setSeriesId] = useState("FEDFUNDS");
  return (
    <div className="mt-3 flex flex-col gap-2 sm:flex-row">
      <Input value={seriesId} onChange={(e) => setSeriesId(e.target.value)} placeholder="series id" />
      <Button variant="secondary" disabled={busy || !seriesId.trim()} onClick={() => void onRun("market.fred", { name: "market.fred", seriesId: seriesId.trim(), limit: 20 })}>
        Fetch series
      </Button>
    </div>
  );
}

function SecPanel({
  busy,
  onRun,
}: {
  busy: boolean;
  onRun: (label: string, job: Parameters<typeof runAuthorizedTool>[0]["data"]) => Promise<void>;
}) {
  const [ticker, setTicker] = useState("AAPL");
  return (
    <div className="mt-3 flex flex-col gap-2 sm:flex-row">
      <Input value={ticker} onChange={(e) => setTicker(e.target.value.toUpperCase())} placeholder="ticker" className="sm:w-32" />
      <Button variant="secondary" disabled={busy || !ticker.trim()} onClick={() => void onRun("market.secFilings", { name: "market.secFilings", ticker: ticker.trim() })}>
        Recent filings
      </Button>
    </div>
  );
}

function TechnicalPanel({
  busy,
  onRun,
}: {
  busy: boolean;
  onRun: (label: string, job: Parameters<typeof runAuthorizedTool>[0]["data"]) => Promise<void>;
}) {
  const [prices, setPrices] = useState("44,44.3,44.1,43.6,44.3,44.8,45,45.1,45.2,45,44.6,44.3,44.8,45.1,45.2,45.4,45.8,46,45.9,46.2");
  return (
    <div className="mt-3 flex flex-col gap-2">
      <textarea
        value={prices}
        onChange={(e) => setPrices(e.target.value)}
        rows={2}
        className="w-full rounded-md border border-white/10 bg-card-elevated px-3 py-2 text-sm text-current outline-none"
      />
      <Button
        variant="secondary"
        disabled={busy || !prices.trim()}
        onClick={() =>
          void onRun("market.technical", {
            name: "market.technical",
            indicator: "sma",
            closes: prices.split(",").map((v) => Number(v.trim())).filter((n) => !Number.isNaN(n)),
            period: 14,
          })
        }
      >
        Calculate SMA
      </Button>
    </div>
  );
}

function RedditPanel({
  busy,
  onRun,
}: {
  busy: boolean;
  onRun: (label: string, job: Parameters<typeof runAuthorizedTool>[0]["data"]) => Promise<void>;
}) {
  const [subreddit, setSubreddit] = useState("CryptoCurrency");
  return (
    <div className="mt-3 flex flex-col gap-2 sm:flex-row">
      <Input value={subreddit} onChange={(e) => setSubreddit(e.target.value)} placeholder="subreddit (no r/)" />
      <Button variant="secondary" disabled={busy || !subreddit.trim()} onClick={() => void onRun("sentiment.reddit", { name: "sentiment.reddit", subreddit: subreddit.trim(), limit: 25 })}>
        Scan subreddit
      </Button>
    </div>
  );
}

function XPanel({
  busy,
  onRun,
}: {
  busy: boolean;
  onRun: (label: string, job: Parameters<typeof runAuthorizedTool>[0]["data"]) => Promise<void>;
}) {
  const [query, setQuery] = useState("$BTC");
  return (
    <div className="mt-3 flex flex-col gap-2 sm:flex-row">
      <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="search query, e.g. $BTC" />
      <Button variant="secondary" disabled={busy || !query.trim()} onClick={() => void onRun("sentiment.x", { name: "sentiment.x", query: query.trim(), maxResults: 25 })}>
        Search (~25 posts, ~$0.13)
      </Button>
    </div>
  );
}

function CcxtPanel({
  busy,
  onRun,
}: {
  busy: boolean;
  onRun: (label: string, job: Parameters<typeof runAuthorizedTool>[0]["data"]) => Promise<void>;
}) {
  const [exchange, setExchange] = useState("binance");
  const [symbol, setSymbol] = useState("BTC/USDT");
  return (
    <div className="mt-3 flex flex-col gap-2 sm:flex-row">
      <Input value={exchange} onChange={(e) => setExchange(e.target.value)} placeholder="exchange" className="sm:w-32" />
      <Input value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder="BTC/USDT" />
      <Button
        variant="secondary"
        disabled={busy || !exchange.trim() || !symbol.trim()}
        onClick={() => void onRun("market.ccxt", { name: "market.ccxt", exchange: exchange.trim(), symbol: symbol.trim(), kind: "ticker" })}
      >
        Get price
      </Button>
    </div>
  );
}

function BrowserPanel({
  busy,
  onRun,
}: {
  busy: boolean;
  onRun: (label: string, job: Parameters<typeof runAuthorizedTool>[0]["data"]) => Promise<void>;
}) {
  const [urls, setUrls] = useState("https://example.com");
  return (
    <div className="mt-3 flex flex-col gap-2">
      <textarea
        value={urls}
        onChange={(e) => setUrls(e.target.value)}
        rows={3}
        placeholder={"https://example.com\nhttps://example.org"}
        className="w-full rounded-md border border-white/10 bg-card-elevated px-3 py-2 text-sm text-current outline-none"
      />
      <Button
        variant="secondary"
        disabled={busy || !urls.trim()}
        onClick={() =>
          void onRun("browser", {
            name: "browser",
            urls: urls
              .split("\n")
              .map((u) => u.trim())
              .filter(Boolean),
          })
        }
      >
        Walk pages
      </Button>
    </div>
  );
}

function EmailPanel({
  busy,
  onRun,
}: {
  busy: boolean;
  onRun: (label: string, job: Parameters<typeof runAuthorizedTool>[0]["data"]) => Promise<void>;
}) {
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [text, setText] = useState("");
  return (
    <div className="mt-3 flex flex-col gap-2">
      <Input value={to} onChange={(e) => setTo(e.target.value)} placeholder="to@example.com" />
      <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" />
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        placeholder="Message"
        className="w-full rounded-md border border-white/10 bg-card-elevated px-3 py-2 text-sm text-current outline-none"
      />
      <Button
        variant="secondary"
        disabled={busy || !to.trim() || !subject.trim() || !text.trim()}
        onClick={() => void onRun("email.send", { name: "email.send", to: to.trim(), subject: subject.trim(), text })}
      >
        Send (requires your click — that's the approval)
      </Button>
    </div>
  );
}

import { useEffect, useState } from "react";
import { Gavel, PlayCircle, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel, PanelTitle, Stat } from "@/components/ui/panel";
import { getPaperDeskSnapshot, placeTestOrder, runCouncilDecision, startPaperSession, type PaperDeskSnapshot } from "@/runtime/paper-desk-server";
import type { CouncilExecutionResult } from "@/trading/execution/council-to-paper-bridge";

const COUNCIL_LABEL: Record<string, string> = {
  technical: "VORTEX · Technical",
  quant: "QUANTUM · Quant",
  risk: "AEGIS · Risk",
};

const ACTION_TONE: Record<string, "ok" | "danger" | "neutral"> = {
  buy: "ok",
  sell: "danger",
  hold: "neutral",
  reject: "danger",
};

export function PaperDeskView() {
  const [snap, setSnap] = useState<PaperDeskSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exchange, setExchange] = useState("binance");
  const [symbol, setSymbol] = useState("BTC/USDT");
  const [qty, setQty] = useState("0.01");
  const [councilResult, setCouncilResult] = useState<CouncilExecutionResult | null>(null);

  async function refresh() {
    try {
      setSnap(await getPaperDeskSnapshot());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the paper desk");
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function start() {
    setBusy(true);
    setError(null);
    try {
      setSnap(await startPaperSession());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start the session");
    } finally {
      setBusy(false);
    }
  }

  async function order(side: "buy" | "sell") {
    setBusy(true);
    setError(null);
    try {
      setSnap(await placeTestOrder({ data: { exchange, symbol, side, qty: Number(qty) } }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Order failed");
    } finally {
      setBusy(false);
    }
  }

  async function runCouncil() {
    setBusy(true);
    setError(null);
    try {
      const { result, desk } = await runCouncilDecision({ data: { exchange, symbol } });
      setCouncilResult(result);
      setSnap(desk);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Council decision failed");
    } finally {
      setBusy(false);
    }
  }

  const running = snap?.sessionState === "running";
  const positions = snap ? Object.values(snap.account.positions) : [];

  return (
    <div className="space-y-4">
      <Panel>
        <div className="flex items-center justify-between gap-3">
          <PanelTitle kicker={`Paper only · ${exchange} live prices via CCXT`} title="Paper trading desk" />
          <Button variant="secondary" onClick={() => void refresh()}>
            <RefreshCw className="size-4" />
          </Button>
        </div>

        {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}

        {!snap ? (
          <p className="mt-4 text-sm text-muted">Loading…</p>
        ) : !running ? (
          <div className="mt-4 flex items-center justify-between rounded-lg border border-warn/25 bg-warn/5 px-4 py-3">
            <div>
              <p className="text-sm font-medium">No session running</p>
              <p className="text-xs text-muted">Starting one is a real, logged action — this never happens automatically.</p>
            </div>
            <Button onClick={() => void start()} disabled={busy}>
              <PlayCircle className="size-4" /> Start paper session
            </Button>
          </div>
        ) : (
          <>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Cash" value={`$${snap.account.cash.toLocaleString(undefined, { maximumFractionDigits: 2 })}`} />
              <Stat label="Equity" value={`$${snap.account.equity.toLocaleString(undefined, { maximumFractionDigits: 2 })}`} />
              <Stat label="Realized PnL" value={`$${snap.account.realizedPnl.toLocaleString(undefined, { maximumFractionDigits: 2 })}`} />
              <Stat label="Daily PnL" value={`$${snap.runtime.dailyPnl.toLocaleString(undefined, { maximumFractionDigits: 2 })}`} />
            </div>
            <div className="mt-2">
              <Badge tone={snap.runtime.killSwitch ? "danger" : "ok"}>{snap.runtime.killSwitch ? "KILL SWITCH ACTIVE" : "Operating normally"}</Badge>
            </div>

            <div className="mt-5">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Positions</p>
              {positions.length === 0 ? (
                <p className="text-sm text-muted">No open positions.</p>
              ) : (
                <ul className="space-y-1.5">
                  {positions.map((p) => (
                    <li key={p.symbol} className="flex items-center justify-between rounded-md border border-white/8 bg-card-elevated px-3 py-2 text-sm">
                      <span className="font-medium">{p.symbol}</span>
                      <span className="text-muted">
                        {p.qty} @ avg {p.avgPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="mt-5 border-t border-white/8 pt-4">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Place a test order (real live price, simulated fill)</p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input value={exchange} onChange={(e) => setExchange(e.target.value)} placeholder="exchange" className="sm:w-32" />
                <Input value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder="BTC/USDT" />
                <Input value={qty} onChange={(e) => setQty(e.target.value)} placeholder="qty" className="sm:w-24" />
                <Button variant="secondary" disabled={busy} onClick={() => void order("buy")}>
                  Buy
                </Button>
                <Button variant="secondary" disabled={busy} onClick={() => void order("sell")}>
                  Sell
                </Button>
              </div>
            </div>

            <div className="mt-5 border-t border-white/8 pt-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted">Council decision</p>
                  <p className="mt-0.5 text-xs text-muted">
                    VORTEX, QUANTUM and AEGIS vote off live {symbol} candles — a real paper order follows if they agree.
                  </p>
                </div>
                <Button disabled={busy} onClick={() => void runCouncil()}>
                  <Gavel className="size-4" /> Run council decision
                </Button>
              </div>

              {councilResult ? (
                <div className="mt-4 space-y-3">
                  <div className="flex items-center justify-between rounded-lg border border-white/8 bg-card-elevated px-4 py-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <Badge tone={ACTION_TONE[councilResult.run.decision.action] ?? "neutral"}>
                          {councilResult.run.decision.action.toUpperCase()}
                        </Badge>
                        <Badge tone={councilResult.executed ? "ok" : "neutral"}>
                          {councilResult.executed ? "Order placed" : "Not executed"}
                        </Badge>
                      </div>
                      <p className="mt-1.5 text-sm text-muted">{councilResult.reason}</p>
                    </div>
                  </div>

                  <ul className="space-y-1.5">
                    {councilResult.run.reviews.map((review) => (
                      <li
                        key={review.workerId}
                        className="flex items-center justify-between rounded-md border border-white/8 bg-card-elevated px-3 py-2 text-sm"
                      >
                        <div>
                          <p className="font-medium">{COUNCIL_LABEL[review.councilId] ?? review.councilId}</p>
                          <p className="text-xs text-muted">{review.rationale}</p>
                        </div>
                        <div className="flex items-center gap-2 text-right">
                          <Badge tone={review.stance === "bull" ? "ok" : review.stance === "bear" ? "danger" : "neutral"}>
                            {review.stance}
                          </Badge>
                          <span className="text-xs text-muted">{(review.confidence * 100).toFixed(0)}%</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          </>
        )}
      </Panel>
    </div>
  );
}

import { useEffect, useState } from "react";
import { CheckCircle2, RefreshCw, ShieldAlert, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Panel, PanelTitle } from "@/components/ui/panel";
import { getReadinessReport } from "@/runtime/readiness-server";
import type { ReadinessGateId, ReadinessReport } from "@/trading/readiness";

const GATE_INFO: Record<ReadinessGateId, { label: string; blurb: string }> = {
  risk: { label: "Risk engine", blurb: "Hard risk limits, kill-switch, and peak-equity tracking are all certified and clear." },
  data: { label: "Data quality", blurb: "Market data is fresh, point-in-time-safe, and coming from a real source — not stale or synthetic." },
  research: { label: "Strategy validation", blurb: "The strategy has passed out-of-sample and walk-forward testing recently — not just a backtest on the data it was tuned on." },
  paper: { label: "Paper track record", blurb: "Enough real paper trades have accumulated, and the account snapshot is healthy." },
  security: { label: "Sandbox & isolation", blurb: "Sandbox self-tests, egress policy, production isolation, and deployment attestation are all verified." },
  connectors: { label: "Connector review", blurb: "The data/execution connectors in use have been reviewed and attested, not just wired up." },
  "deployment-sandbox": { label: "Deployment sandbox", blurb: "The deployment environment itself has been attested as sandboxed correctly." },
  governance: { label: "Owner governance", blurb: "The owner has an active capital approval and a valid risk envelope on file for this budget." },
  observability: { label: "Observability", blurb: "The event journal, post-trade attribution, and snapshots are all healthy and being recorded." },
  "operational-health": { label: "Operational health", blurb: "The overall operating cycle is healthy, not degraded or halted, per the latest health check." },
};

export function ReadinessView() {
  const [report, setReport] = useState<ReadinessReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const result = await getReadinessReport();
      setReport(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the readiness report");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const passCount = report?.gates.filter((g) => g.ok).length ?? 0;
  const totalCount = report?.gates.length ?? 10;

  return (
    <div className="space-y-4">
      <Panel>
        <div className="flex items-center justify-between gap-3">
          <PanelTitle kicker="Governance · read-only" title="Live trading readiness" />
          <Button variant="secondary" disabled={loading} onClick={() => void load()}>
            <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>

        {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}

        {report ? (
          <>
            <div className={`mt-4 flex items-center gap-3 rounded-lg border px-4 py-3 ${report.readyForLive ? "border-ok/30 bg-ok/10" : "border-warn/25 bg-warn/5"}`}>
              {report.readyForLive ? <CheckCircle2 className="size-5 shrink-0 text-ok" /> : <ShieldAlert className="size-5 shrink-0 text-warn" />}
              <div>
                <p className="text-sm font-medium">{report.readyForLive ? "All gates pass" : `Not ready — ${passCount}/${totalCount} gates passing`}</p>
                <p className="text-xs text-muted">
                  Live trading only ever needs one more, always-manual step from here — this dashboard never flips it by itself.
                </p>
              </div>
            </div>

            <ul className="mt-4 space-y-2">
              {report.gates.map((gate) => {
                const info = GATE_INFO[gate.id];
                return (
                  <li key={gate.id} className="rounded-md border border-white/8 bg-card-elevated px-3 py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        {gate.ok ? <CheckCircle2 className="size-4 shrink-0 text-ok" /> : <XCircle className="size-4 shrink-0 text-muted" />}
                        <span className="text-sm font-medium">{info?.label ?? gate.id}</span>
                      </div>
                      <Badge tone={gate.ok ? "ok" : "neutral"}>{gate.ok ? "PASS" : "NOT YET"}</Badge>
                    </div>
                    {info ? <p className="mt-1 pl-6 text-xs text-muted">{info.blurb}</p> : null}
                    {gate.reasons.length ? (
                      <p className="mt-1 pl-6 font-mono text-[11px] text-warn/80">{gate.reasons.join(", ")}</p>
                    ) : null}
                  </li>
                );
              })}
            </ul>

            <p className="mt-4 text-xs text-muted">
              Several gates above (data, research, security, connectors, observability) still read their default "not yet" state because the
              systems that would prove them haven't been wired to feed this report yet — that wiring, not a UI button, is the real remaining
              work between here and live trading.
            </p>
          </>
        ) : loading ? (
          <p className="mt-4 text-sm text-muted">Loading…</p>
        ) : null}
      </Panel>
    </div>
  );
}

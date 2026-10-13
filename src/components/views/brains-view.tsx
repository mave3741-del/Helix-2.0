import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel, PanelTitle } from "@/components/ui/panel";
import { formatCompact, formatPct } from "@/lib/utils";
import {
  listProviders,
  removeProvider,
  saveProvider,
  testProvider,
} from "@/lib/ceo-plan";
import { honestyMatrix } from "@/runtime/honesty";
import type { ProviderPublic } from "@/runtime/brain/providers";
import type { RoutingMode } from "@/org/types";
import { useOrgStore } from "@/store/org-store";

function toneForConnection(c: string) {
  if (c === "connected") return "ok" as const;
  if (c === "invalid" || c === "offline") return "danger" as const;
  if (c === "untested") return "warn" as const;
  return "neutral" as const;
}

export function BrainsView() {
  const epoch = useOrgStore((s) => s.epoch);
  const brains = useOrgStore((s) => s.brains);
  const faults = useOrgStore((s) => s.faults);
  const budgets = useOrgStore((s) => s.budgets);
  const fallbacks = useOrgStore((s) => s.kpis.fallbacks);
  const runtime = useOrgStore((s) => s.runtime);
  const kpis = useOrgStore((s) => s.kpis);
  const workers = useOrgStore((s) => s.workerOrder);
  const memory = useOrgStore((s) => s.memory);
  const [providers, setProviders] = useState<ProviderPublic[]>([]);
  const [drafts, setDrafts] = useState<Record<string, { key: string; endpoint: string; model: string }>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  void epoch;

  async function refresh() {
    const rows = await listProviders();
    setProviders(rows);
    setDrafts((d) => {
      const next = { ...d };
      for (const p of rows) {
        next[p.providerId] ??= { key: "", endpoint: p.endpoint, model: p.model };
      }
      return next;
    });
  }

  useEffect(() => {
    void refresh().catch(() => setMsg("Provider list unavailable"));
  }, []);

  const honesty = honestyMatrix({
    workerCount: workers.length,
    liveMode: Boolean(runtime?.liveMode),
    routingMode: runtime?.routingMode ?? "auto",
    liveTurns: kpis.liveTurns,
    localTurns: kpis.localTurns,
    connectedProviders: providers.filter((p) => p.connection === "connected" && p.kind !== "heuristic").length,
    configuredProviders: providers.filter((p) => p.configured && p.kind !== "heuristic").length,
    toolRuns: runtime?.toolRuns ?? 0,
    verifiedLessons: memory.filter((m) => m.status === "verified").length,
  });

  const modes: { id: RoutingMode; label: string }[] = [
    { id: "auto", label: "Auto" },
    { id: "hybrid", label: "Hybrid" },
    { id: "cloud-first", label: "Cloud first" },
    { id: "local-only", label: "Local only" },
  ];

  return (
    <div className="space-y-5">
      <div>
        <p className="font-mono text-[11px] tracking-[0.2em] text-muted uppercase">Brain runtime</p>
        <h1 className="mt-1 text-3xl font-medium tracking-tight">Models are replaceable brains.</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Keys stay server-side. After save they are never shown again. Local endpoints work without
          OmniRoute. Connection is only “connected” after a live probe.
        </p>
      </div>

      <Panel>
        <PanelTitle kicker="Honesty" title="What is actually true right now" />
        <ul className="space-y-3">
          {honesty.map((row) => (
            <li key={row.name} className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-sm">{row.name}</p>
                <p className="text-xs text-muted">{row.note}</p>
              </div>
              <Badge
                tone={
                  row.grade === "runtime-verified" || row.grade === "connected"
                    ? "ok"
                    : row.grade === "not-ready"
                      ? "danger"
                      : "live"
                }
              >
                {row.grade}
              </Badge>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel>
        <PanelTitle kicker="Routing" title="Who may be called" />
        <div className="flex flex-wrap gap-2">
          {modes.map((m) => (
            <Button
              key={m.id}
              size="sm"
              variant={(runtime?.routingMode ?? "auto") === m.id ? "default" : "secondary"}
              onClick={() => useOrgStore.getState().setRouting(m.id)}
            >
              {m.label}
            </Button>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted">
          Local only never leaves the machine. Hybrid tries local LLMs first. Auto picks by capability,
          cost, and health. Scheduler cap is {runtime?.liveCap ?? 4} live turns — not 1,000 parallel models.
        </p>
      </Panel>

      <Panel>
        <PanelTitle kicker="Fallback chain" title="Failure is not organizational failure" />
        <div className="flex flex-wrap items-center gap-2">
          {brains
            .filter((b) => b.available)
            .map((b, i) => (
              <div key={b.id} className="flex items-center gap-2">
                {i > 0 ? <span className="text-muted">→</span> : null}
                <div className="rounded-md bg-card-elevated px-3 py-2">
                  <p className="text-sm">{b.name}</p>
                  <p className="font-mono text-[10px] text-muted">
                    {b.kind ?? b.provider} · {b.connection ?? (b.available ? "untested" : "not_configured")}
                  </p>
                </div>
              </div>
            ))}
        </div>
        <p className="mt-3 text-xs text-muted">{fallbacks} fallback events recorded</p>
      </Panel>

      <Panel>
        <PanelTitle kicker="Providers" title="API keys and local endpoints" />
        {msg ? <p className="mb-3 text-xs text-warn">{msg}</p> : null}
        <div className="space-y-4">
          {providers.map((p) => {
            const draft = drafts[p.providerId] ?? { key: "", endpoint: p.endpoint, model: p.model };
            return (
              <div key={p.providerId} className="rounded-lg border border-border p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium">{p.name}</p>
                    <p className="text-xs text-muted">{p.notes}</p>
                  </div>
                  <Badge tone={toneForConnection(p.connection)}>{p.connection}</Badge>
                </div>
                <p className="mt-2 font-mono text-[11px] text-muted">
                  {p.kind} · {p.configured ? `configured via ${p.source}` : "not configured"}
                  {p.last4 ? ` · ****${p.last4}` : ""}
                  {p.latencyMs != null ? ` · ${p.latencyMs}ms` : ""}
                </p>
                {p.kind !== "heuristic" ? (
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {p.needsKey ? (
                      <Input
                        type="password"
                        autoComplete="off"
                        placeholder={p.configured ? "New key (leave blank to keep)" : "API key"}
                        value={draft.key}
                        onChange={(e) =>
                          setDrafts((d) => ({
                            ...d,
                            [p.providerId]: { ...draft, key: e.target.value },
                          }))
                        }
                      />
                    ) : (
                      <p className="self-center text-xs text-muted">No key required</p>
                    )}
                    <Input
                      placeholder="Model"
                      value={draft.model}
                      onChange={(e) =>
                        setDrafts((d) => ({
                          ...d,
                          [p.providerId]: { ...draft, model: e.target.value },
                        }))
                      }
                    />
                    <Input
                      className="sm:col-span-2"
                      placeholder="Endpoint"
                      value={draft.endpoint}
                      onChange={(e) =>
                        setDrafts((d) => ({
                          ...d,
                          [p.providerId]: { ...draft, endpoint: e.target.value },
                        }))
                      }
                    />
                  </div>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  {p.kind !== "heuristic" ? (
                    <Button
                      size="sm"
                      disabled={busy === p.providerId}
                      onClick={async () => {
                        setBusy(p.providerId);
                        setMsg(null);
                        try {
                          await saveProvider({
                            data: {
                              providerId: p.providerId,
                              apiKey: draft.key || undefined,
                              endpoint: draft.endpoint,
                              model: draft.model,
                            },
                          });
                          setDrafts((d) => ({ ...d, [p.providerId]: { ...draft, key: "" } }));
                          await refresh();
                        } catch (e) {
                          setMsg(e instanceof Error ? e.message : "Save failed");
                        } finally {
                          setBusy(null);
                        }
                      }}
                    >
                      Save
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={busy === p.providerId}
                    onClick={async () => {
                      setBusy(p.providerId);
                      setMsg(null);
                      try {
                        const res = await testProvider({ data: { providerId: p.providerId } });
                        setMsg(
                          res.ok
                            ? `${p.name} connected${res.models?.length ? ` · ${res.models.length} models` : ""}`
                            : `${p.name}: ${res.error}`,
                        );
                        await refresh();
                      } catch (e) {
                        setMsg(e instanceof Error ? e.message : "Probe failed");
                      } finally {
                        setBusy(null);
                      }
                    }}
                  >
                    Test connection
                  </Button>
                  {p.source === "owner" ? (
                    <Button
                      size="sm"
                      variant="danger"
                      disabled={busy === p.providerId}
                      onClick={async () => {
                        setBusy(p.providerId);
                        await removeProvider({ data: { providerId: p.providerId } });
                        await refresh();
                        setBusy(null);
                      }}
                    >
                      Remove key
                    </Button>
                  ) : null}
                </div>
                {p.discoveredModels.length ? (
                  <p className="mt-2 font-mono text-[10px] text-muted">
                    {p.discoveredModels.slice(0, 8).join(" · ")}
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>
      </Panel>

      <div className="grid gap-3 sm:grid-cols-2">
        {brains.map((b) => (
          <Panel key={b.id}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <PanelTitle kicker={b.provider} title={b.name} />
                <p className="text-sm text-muted">{b.specialty}</p>
              </div>
              <Badge tone={b.available ? "ok" : "danger"}>{b.connection ?? b.health ?? (b.available ? "untested" : "down")}</Badge>
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <div>
                <dt className="text-muted">Accuracy prior</dt>
                <dd className="font-mono">{formatPct(b.accuracy)}</dd>
              </div>
              <div>
                <dt className="text-muted">Latency prior</dt>
                <dd className="font-mono">{b.latencyMs}ms</dd>
              </div>
              <div>
                <dt className="text-muted">Cost class</dt>
                <dd className="font-mono">{b.costClass ?? "unknown"}</dd>
              </div>
              <div>
                <dt className="text-muted">Tokens</dt>
                <dd className="font-mono">{formatCompact(b.tokensUsed)}</dd>
              </div>
            </dl>
            <p className="mt-2 text-xs text-muted">{b.capabilities.join(" · ")}</p>
            <Button
              className="mt-3"
              size="sm"
              variant={b.available ? "secondary" : "default"}
              onClick={() => useOrgStore.getState().toggleBrain(b.id, !b.available)}
            >
              {b.available ? "Disable brain" : "Enable brain"}
            </Button>
          </Panel>
        ))}
      </div>

      <Panel>
        <PanelTitle kicker="Budgets" title="Resource management" />
        <p className="font-mono text-sm tabular-nums">
          {formatCompact(budgets.tokens)} / {formatCompact(budgets.tokenCap)} tokens · {budgets.apiCalls} /{" "}
          {budgets.apiCap} Orion API calls
        </p>
        <div className="mt-3 h-1 rounded-full bg-card-elevated">
          <div
            className="h-1 rounded-full bg-accent"
            style={{ width: `${Math.min(100, (budgets.tokenCap ? budgets.tokens / budgets.tokenCap : 0) * 100)}%` }}
          />
        </div>
      </Panel>

      <Panel>
        <PanelTitle kicker="Fault injection" title="Resilience drills" />
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["modelFailure", "Model failure"],
              ["providerFailure", "Provider failure"],
              ["toolFailure", "Tool failure"],
              ["rateLimit", "Rate limit"],
              ["badOutput", "Bad output"],
              ["failedDeploy", "Failed deploy"],
            ] as const
          ).map(([k, label]) => (
            <Button
              key={k}
              size="sm"
              variant={faults[k] ? "danger" : "secondary"}
              onClick={() => useOrgStore.getState().injectFault({ [k]: !faults[k] })}
            >
              {label}
            </Button>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted">
          Injected faults exercise fallback and recovery without resetting task state.
        </p>
      </Panel>
    </div>
  );
}

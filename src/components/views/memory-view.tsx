import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Panel, PanelTitle } from "@/components/ui/panel";
import { retrieveMemory } from "@/org/engine";
import { useOrgStore } from "@/store/org-store";

const TONE = {
  verified: "ok",
  unverified: "warn",
  rejected: "danger",
  superseded: "neutral",
  under_review: "live",
  proposed: "warn",
  testing: "live",
  deprecated: "neutral",
} as const;

export function MemoryView() {
  const epoch = useOrgStore((s) => s.epoch);
  const memory = useOrgStore((s) => s.memory);
  const [q, setQ] = useState("qc");
  // `epoch` isn't read directly in the callback, but retrieveMemory() pulls
  // live state via getState() rather than through its arguments, so `epoch`
  // is the intended trigger to recompute whenever the store changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const hits = useMemo(() => retrieveMemory(useOrgStore.getState(), q || "org", 8), [q, epoch]);

  return (
    <div className="space-y-5">
      <div>
        <p className="font-mono text-[11px] tracking-[0.2em] text-muted uppercase">Organizational memory</p>
        <h1 className="mt-1 text-3xl font-medium tracking-tight">The org remembers. Models don’t.</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Hierarchical, token-efficient retrieval. Rejected approaches never become trusted knowledge.
          Workers receive a context packet — not the entire archive.
        </p>
      </div>

      <Panel>
        <PanelTitle kicker="Retrieval" title="Semantic filter (no full dump)" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Query tags, titles, capabilities" />
        <ul className="mt-4 space-y-2">
          {hits.map((m) => (
            <li key={m.id} className="rounded-md bg-card-elevated p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm">{m.title}</p>
                <Badge tone={TONE[m.status]}>{m.status}</Badge>
              </div>
              <p className="mt-1 text-xs text-muted">{m.content.slice(0, 180)}</p>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel>
        <PanelTitle kicker="Layers" title="Org · department · team · worker · task · project" />
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {memory.slice(0, 18).map((m) => (
            <div key={m.id} className="rounded-md bg-card-elevated p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-[10px] text-muted">{m.layer}</span>
                <Badge tone={TONE[m.status]}>{m.status}</Badge>
              </div>
              <p className="mt-1 text-sm">{m.title}</p>
              <p className="mt-1 text-xs text-muted">{m.claim}</p>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

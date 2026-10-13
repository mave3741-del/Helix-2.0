import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { formatPct } from "@/lib/utils";
import { useOrgStore } from "@/store/org-store";

const TONE = {
  production: "ok",
  approved: "live",
  testing: "live",
  sandbox: "warn",
  review: "warn",
  draft: "neutral",
  rolled_back: "danger",
} as const;

export function SkillsView() {
  const epoch = useOrgStore((s) => s.epoch);
  const skills = useOrgStore((s) => s.skills);
  void epoch;

  return (
    <div className="space-y-5">
      <div>
        <p className="font-mono text-[11px] tracking-[0.2em] text-muted uppercase">Skill factory</p>
        <h1 className="mt-1 text-3xl font-medium tracking-tight">No untested skill in production.</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Skills are created when a capability is missing — not hardcoded forever. Pipeline: generate →
          sandbox → test → break → fix → retest → benchmark → QC → approve → deploy. Rollback is
          retained.
        </p>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {skills.map((s) => (
          <Panel key={s.id}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-mono text-[10px] text-muted">
                  {s.id} · v{s.version}
                </p>
                <h2 className="text-base font-medium tracking-tight">{s.name}</h2>
              </div>
              <Badge tone={TONE[s.deploymentStatus]}>{s.deploymentStatus}</Badge>
            </div>
            <p className="mt-2 text-sm text-muted">{s.purpose}</p>
            <p className="mt-2 text-xs text-muted">{s.capabilities.join(" · ")}</p>
            <div className="mt-3 flex flex-wrap gap-1">
              {s.tests.map((t) => (
                <Badge key={t.name} tone={t.status === "pass" ? "ok" : t.status === "fail" ? "danger" : "neutral"}>
                  {t.name}:{t.status}
                </Badge>
              ))}
            </div>
            <p className="mt-3 font-mono text-xs text-muted">
              benchmark {formatPct(s.benchmark.score)} · n={s.benchmark.samples} · success{" "}
              {formatPct(s.successRate)}
            </p>
            <p className="mt-1 text-xs text-muted">Limit: {s.limitations[0]}</p>
            {s.deploymentStatus === "production" ? (
              <Button className="mt-3" size="sm" variant="danger" onClick={() => useOrgStore.getState().disableSkill(s.id)}>
                Rollback skill
              </Button>
            ) : null}
          </Panel>
        ))}
      </div>
    </div>
  );
}

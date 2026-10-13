import { Badge } from "@/components/ui/badge";
import { Panel, PanelTitle } from "@/components/ui/panel";
import { useOrgStore } from "@/store/org-store";

export function OrganizationView() {
  const epoch = useOrgStore((s) => s.epoch);
  const depts = useOrgStore((s) => s.departments);
  const workers = useOrgStore((s) => s.workers);
  const teams = useOrgStore((s) => s.teams);
  const ceo = useOrgStore((s) => s.ceo);
  const stats = useOrgStore((s) => s.deptStats);
  void epoch;

  const execs = Object.values(workers).filter((w) => w.role === "executive");

  return (
    <div className="space-y-5">
      <div>
        <p className="font-mono text-[11px] tracking-[0.2em] text-muted uppercase">Hierarchy</p>
        <h1 className="mt-1 text-3xl font-medium tracking-tight">One organization.</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Owner → Orion → executives → managers → supervisors → teams → 1,000 workers. Leadership
          succession is automatic. Departments are not silos.
        </p>
      </div>

      <Panel>
        <PanelTitle kicker="HELIX" title="Owner and Orion" />
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg bg-card-elevated p-4">
            <p className="font-mono text-[10px] tracking-[0.16em] text-muted uppercase">Owner</p>
            <p className="mt-1 text-lg">Strategic authority</p>
            <p className="mt-2 text-sm text-muted">
              Sets mission, priorities, policies, and high-risk approvals. Does not manage workers
              individually.
            </p>
          </div>
          <div className="rounded-lg bg-card-elevated p-4">
            <p className="font-mono text-[10px] tracking-[0.16em] text-muted uppercase">{ceo.id}</p>
            <p className="mt-1 text-lg">{ceo.name}</p>
            <p className="mt-2 text-sm text-muted">{ceo.lastBrief}</p>
            <Badge tone="live" className="mt-3">
              {ceo.status} · {ceo.modelId}
            </Badge>
          </div>
        </div>
      </Panel>

      <Panel>
        <PanelTitle kicker="Executive management" title="C-level" />
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {execs.map((e) => (
            <div key={e.id} className="rounded-md bg-card-elevated p-3">
              <p className="font-mono text-[10px] text-muted">{e.id}</p>
              <p className="mt-1 text-sm">{e.name}</p>
              <p className="text-xs text-muted">{e.title}</p>
            </div>
          ))}
        </div>
      </Panel>

      <div className="space-y-3">
        {depts.map((d) => {
          const manager = workers[d.managerId];
          const deptTeams = teams.filter((t) => t.departmentId === d.id);
          const st = stats[d.id];
          return (
            <Panel key={d.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-mono text-[10px] tracking-[0.16em] text-muted">{d.code}</p>
                  <h2 className="text-lg font-medium tracking-tight">{d.name}</h2>
                  <p className="text-sm text-muted">{d.purpose}</p>
                </div>
                <Badge>{st?.available ?? 0} available</Badge>
              </div>
              <p className="mt-3 text-xs text-muted">
                Manager {manager?.name} ({d.managerId}) · {d.supervisorIds.length} supervisors ·{" "}
                {deptTeams.reduce((a, t) => a + t.workerIds.length, 0)} workers
              </p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {deptTeams.map((t) => (
                  <div key={t.id} className="rounded-md bg-card-elevated p-3">
                    <p className="text-sm">{t.name}</p>
                    <p className="font-mono text-[10px] text-muted">
                      {t.supervisorId} · {t.workerIds.length} · QC {t.qcId ?? "—"}
                    </p>
                  </div>
                ))}
              </div>
            </Panel>
          );
        })}
      </div>
    </div>
  );
}

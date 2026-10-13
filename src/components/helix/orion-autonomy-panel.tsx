import { LockKeyhole, Mic2, Radio, ShieldCheck, Sparkles, WalletCards, Waves, Workflow } from "lucide-react";
import { useOrgStore } from "@/store/org-store";
import { ORION_AUTONOMY_TARGET } from "@/runtime/jarvis/autonomy-policy";

const HUMAN_BOUNDARIES = [
  { label: "Capital envelope", icon: WalletCards, key: "capital" },
  { label: "Emergency halt", icon: ShieldCheck, key: "halt" },
  { label: "Credentials", icon: LockKeyhole, key: "credentials" },
  { label: "Major self-change", icon: Workflow, key: "self-change" },
] as const;

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function OrionAutonomyPanel() {
  const orgStatus = useOrgStore((s) => s.orgStatus);
  const runtime = useOrgStore((s) => s.runtime);
  const workerCount = useOrgStore((s) => s.workerOrder.length);
  const activeWorkers = useOrgStore((s) => s.kpis.activeWorkers);
  const pendingApprovals = useOrgStore((s) => s.approvals.filter((a) => a.status === "pending").length);
  const availableWorkers = useOrgStore((s) => s.kpis.availableWorkers);

  const running = orgStatus === "running";
  const research = running ? 100 : 0;
  const council = workerCount > 0 ? clampPercent((activeWorkers + availableWorkers) / workerCount * 100) : 0;
  const execution = runtime.liveMode ? 0 : running ? 100 : 0;
  const monitoring = running ? 100 : 0;

  return (
    <section className="orion-autonomy-panel" aria-label="Orion autonomy status">
      <div className="orion-autonomy-head">
        <div>
          <div className="orion-kicker"><Sparkles className="size-3" /> ORION COMMAND MODEL</div>
          <h2>Live autonomy</h2>
          <p>Orion coordinates routine work automatically; hard governance boundaries remain enforced by HELIX.</p>
        </div>
        <div className="orion-score">
          <span>Policy target</span>
          <strong>{Math.round(ORION_AUTONOMY_TARGET * 100)}%</strong>
          <small>{runtime.liveMode ? "Live mode requested" : "Live execution locked"}</small>
        </div>
      </div>

      <div className="orion-autonomy-grid">
        <div className="orion-lanes">
          {[
            ["Research", research, running ? "Active runtime" : "Paused"],
            ["Agent council", council, `${activeWorkers} active · ${availableWorkers} available`],
            ["Paper execution", execution, runtime.liveMode ? "Unexpected live flag — blocked" : "Governed paper lane"],
            ["Monitoring", monitoring, `${pendingApprovals} owner gate${pendingApprovals === 1 ? "" : "s"}`],
          ].map(([label, value, note]) => (
            <div className="orion-lane" key={String(label)}>
              <div className="orion-lane-top">
                <span>{label}</span>
                <b>{clampPercent(Number(value))}%</b>
              </div>
              <div className="orion-progress">
                <span className="orion-progress-fill cyan" style={{ width: `${clampPercent(Number(value))}%` }} />
              </div>
              <div className="orion-lane-note">{note}</div>
            </div>
          ))}
        </div>

        <div className="orion-core-card">
          <div className="orion-core-ring"><div className="orion-core-dot" /></div>
          <div className="orion-core-copy">
            <span className="orion-live"><span /> ORION ONLINE</span>
            <strong>Executive orchestration</strong>
            <p>Objective creation, worker routing, council coordination, governance actions and monitored paper workflows are now runtime-backed.</p>
          </div>
        </div>
      </div>

      <div className="orion-boundary-row">
        <div className="orion-boundary-label"><Radio className="size-3.5 text-cyan-200/65" /><span>Human boundary layer</span></div>
        <div className="orion-boundaries">
          {HUMAN_BOUNDARIES.map(({ label, icon: Icon, key }) => (
            <div className="orion-boundary" key={key}>
              <Icon className="size-3.5 text-white/45" />
              <span>{label}</span>
              <LockKeyhole className="ml-auto size-3 text-amber-200/50" />
            </div>
          ))}
        </div>
      </div>

      <div className="orion-command-strip">
        <div><Mic2 className="size-3.5 text-cyan-200/60" /> Voice → Intent → Orion</div>
        <div><Waves className="size-3.5 text-violet-200/60" /> Agents → Evidence → Decision</div>
        <div><ShieldCheck className="size-3.5 text-emerald-200/60" /> Risk → Policy → Action</div>
      </div>
    </section>
  );
}

import { Link, useRouterState } from "@tanstack/react-router";
import {
  Activity,
  Beaker,
  BookOpen,
  Brain,
  Building2,
  CircuitBoard,
  Command,
  GaugeCircle,
  LineChart,
  ListTodo,
  Menu,
  OctagonX,
  Pause,
  Play,
  Scale,
  ShieldCheck,
  Users,
  Wrench,
  X,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { HelixMark } from "@/components/mark";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { orgTone } from "@/components/status";
import { cn, formatCompact } from "@/lib/utils";
import { drainLiveQueue } from "@/runtime/live-drain";
import { useOrgStore } from "@/store/org-store";

export const NAV = [
  { to: "/", label: "Command", icon: Command, group: "Direct" },
  { to: "/paper-desk", label: "Paper Desk", icon: LineChart, group: "Direct" },
  { to: "/organization", label: "Organization", icon: Building2, group: "Operate" },
  { to: "/workforce", label: "Workforce", icon: Users, group: "Operate" },
  { to: "/work", label: "Work", icon: ListTodo, group: "Operate" },
  { to: "/quality", label: "Quality", icon: ShieldCheck, group: "Assure" },
  { to: "/brains", label: "Brains", icon: Brain, group: "Assure" },
  { to: "/tools", label: "Tools", icon: Wrench, group: "Assure" },
  { to: "/skills", label: "Skills", icon: CircuitBoard, group: "Assure" },
  { to: "/memory", label: "Memory", icon: BookOpen, group: "Assure" },
  { to: "/governance", label: "Governance", icon: Scale, group: "Govern" },
  { to: "/readiness", label: "Readiness", icon: GaugeCircle, group: "Govern" },
  { to: "/improve", label: "Improve", icon: Activity, group: "Govern" },
  { to: "/scenarios", label: "Prove", icon: Beaker, group: "Govern" },
];

const MOBILE_TABS = [
  { to: "/", label: "Command", icon: Command },
  { to: "/work", label: "Work", icon: ListTodo },
  { to: "/workforce", label: "People", icon: Users },
  { to: "/quality", label: "Quality", icon: ShieldCheck },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const hydrated = useOrgStore((s) => s.hydrated);
  const orgStatus = useOrgStore((s) => s.orgStatus);
  const kpis = useOrgStore((s) => s.kpis);
  const epoch = useOrgStore((s) => s.epoch);
  const identity = useOrgStore((s) => s.identity);
  const approvals = useOrgStore((s) => s.approvals);
  const [menu, setMenu] = useState(false);
  const [halt, setHalt] = useState(false);
  const pending = approvals.filter((a) => a.status === "pending").length;
  const commandMode = pathname === "/";

  useEffect(() => {
    useOrgStore.getState().setHydrated();
    void Promise.resolve(useOrgStore.persist.rehydrate()).finally(() => {
      useOrgStore.getState().setHydrated();
    });
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => {
      useOrgStore.getState().tick();
      void drainLiveQueue();
    }, 420);
    return () => window.clearInterval(id);
  }, [hydrated]);

  return (
    <div className="min-h-dvh bg-background text-foreground">
      {!commandMode ? <aside className="fixed inset-y-0 left-0 z-30 hidden w-56 flex-col border-r border-border bg-background lg:flex">
        <div className="flex items-center gap-2.5 px-4 py-5">
          <HelixMark />
          <div>
            <p className="text-sm font-medium tracking-tight">Helix</p>
            <p className="font-mono text-[10px] tracking-[0.16em] text-muted uppercase">Trading intelligence</p>
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto px-2 pb-4">
          {["Direct", "Operate", "Assure", "Govern"].map((group) => (
            <div key={group} className="mb-3">
              <p className="px-2 py-1.5 font-mono text-[10px] tracking-[0.18em] text-muted uppercase">
                {group}
              </p>
              {NAV.filter((n) => n.group === group).map((n) => {
                const active = n.to === "/" ? pathname === "/" : pathname.startsWith(n.to);
                const Icon = n.icon;
                return (
                  <Link
                    key={n.to}
                    to={n.to}
                    className={cn(
                      "flex h-10 items-center gap-2 rounded-md px-2 text-sm transition-colors duration-150",
                      active ? "bg-card-elevated text-foreground" : "text-muted hover:text-foreground",
                    )}
                  >
                    <Icon className="size-4" />
                    {n.label}
                    {n.to === "/governance" && pending > 0 ? (
                      <span className="ml-auto font-mono text-[10px] text-warn">{pending}</span>
                    ) : null}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="border-t border-border px-4 py-3">
          <p className="truncate text-xs text-muted">{identity.ownerName}</p>
          <p className="font-mono text-[10px] text-muted tabular-nums">epoch {epoch}</p>
        </div>
      </aside> : null}

      {!commandMode ? <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-border bg-background/95 px-3 lg:ml-56 lg:px-6">
        <button
          className="flex size-11 items-center justify-center rounded-md lg:hidden"
          aria-label="Open menu"
          onClick={() => setMenu(true)}
        >
          <Menu className="size-5" />
        </button>
        <div className="flex items-center gap-2 lg:hidden">
          <HelixMark className="size-6" />
          <span className="text-sm font-medium">Helix</span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Badge tone={orgTone(orgStatus)}>
            <span
              className={cn(
                "mr-1.5 inline-block size-1.5 rounded-full bg-current",
                orgStatus === "running" && "live-dot",
              )}
            />
            {orgStatus}
          </Badge>
          <span className="hidden font-mono text-[11px] text-muted tabular-nums sm:inline">
            {formatCompact(kpis.availableWorkers)} idle · {kpis.activeWorkers} live
          </span>
          {orgStatus === "running" ? (
            <Button variant="ghost" size="sm" onClick={() => useOrgStore.getState().pause()}>
              <Pause /> Pause
            </Button>
          ) : orgStatus === "paused" || orgStatus === "shutdown" ? (
            <Button variant="ghost" size="sm" onClick={() => useOrgStore.getState().resume()}>
              <Play /> Resume
            </Button>
          ) : null}
          <Button variant="danger" size="sm" onClick={() => setHalt(true)}>
            <OctagonX /> Halt
          </Button>
        </div>
      </header> : null}

      <main className={commandMode ? "" : "lg:ml-56"}>
        <div className={commandMode ? "min-h-dvh" : "mx-auto max-w-7xl px-3 pb-24 pt-5 sm:px-6 sm:pt-6 lg:pb-10"}>{children}</div>
      </main>

      {!commandMode ? <nav className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t border-border bg-background lg:hidden">
        {MOBILE_TABS.map((n) => {
          const active = n.to === "/" ? pathname === "/" : pathname.startsWith(n.to);
          const Icon = n.icon;
          return (
            <Link
              key={n.to}
              to={n.to}
              className={cn(
                "flex h-14 flex-col items-center justify-center gap-0.5 text-[10px]",
                active ? "text-foreground" : "text-muted",
              )}
            >
              <Icon className="size-4" />
              {n.label}
            </Link>
          );
        })}
        <button
          className="flex h-14 flex-col items-center justify-center gap-0.5 text-[10px] text-muted"
          onClick={() => setMenu(true)}
        >
          <CircuitBoard className="size-4" />
          More
        </button>
      </nav> : null}

      {menu ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button className="absolute inset-0 bg-background/70" onClick={() => setMenu(false)} />
          <div className="absolute inset-y-0 left-0 w-[min(20rem,86vw)] overflow-y-auto bg-card p-4">
            <div className="mb-4 flex items-center justify-between">
              <span className="text-sm font-medium">Navigate</span>
              <Button variant="ghost" size="icon" className="size-11" onClick={() => setMenu(false)}>
                <X />
              </Button>
            </div>
            {NAV.map((n) => {
              const Icon = n.icon;
              return (
                <Link
                  key={n.to}
                  to={n.to}
                  onClick={() => setMenu(false)}
                  className="flex h-12 items-center gap-3 rounded-md px-2 text-sm"
                >
                  <Icon className="size-4" />
                  {n.label}
                </Link>
              );
            })}
          </div>
        </div>
      ) : null}

      <Dialog open={halt} onOpenChange={setHalt}>
        <DialogContent title="Emergency shutdown">
          <p className="text-sm leading-relaxed text-muted">
            Stops new autonomous actions immediately. Task state, memory, and audit logs are
            preserved for recovery.
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setHalt(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                useOrgStore.getState().shutdown();
                setHalt(false);
              }}
            >
              Halt organization
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

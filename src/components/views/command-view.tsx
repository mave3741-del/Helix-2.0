import { useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { AudioLines, Menu, Sparkles, Volume2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { OrionCouncilStage } from "@/components/helix/orion-council-stage";
import { VoiceComposer } from "@/components/helix/voice-composer";
import { OrionAutonomyPanel } from "@/components/helix/orion-autonomy-panel";
import { NAV } from "@/components/shell";
import { orchestrateJarvis } from "@/lib/ceo-plan";
import { decideOrionAction } from "@/runtime/jarvis/autonomy-policy";
import { COUNCIL_AGENTS, speakAsAgent } from "@/lib/agent-voices";
import { formatCompact, timeAgo } from "@/lib/utils";
import { useOrgStore } from "@/store/org-store";

const QUICK_STARTERS = [
  "Give me the current system and risk status.",
  "Scan the market and summarize the strongest opportunities.",
  "Bring me the latest news and sentiment that matter.",
];

// Orion is the fixed core of the stage; everyone else orbits around it.
const COUNCIL_MEMBERS = COUNCIL_AGENTS.filter((name) => name !== "Orion");
const ALL_AGENTS = COUNCIL_AGENTS;

const NAV_GROUPS = ["Direct", "Operate", "Assure", "Govern"] as const;

type Message = { id: string; role: "user" | "agent"; text: string; at: number; meta?: string; agent?: string };
type ReasoningItem = { agent: string; summary: string; stance?: "bull" | "bear" | "neutral" | "abstain"; confidence?: number };

export function CommandView() {
  const kpis = useOrgStore((s) => s.kpis);
  const planning = useOrgStore((s) => s.planning);
  const planError = useOrgStore((s) => s.planError);
  const runtime = useOrgStore((s) => s.runtime);
  const orgStatus = useOrgStore((s) => s.orgStatus);
  const approvals = useOrgStore((s) => s.approvals).filter((a) => a.status === "pending");
  const [text, setText] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [activeAgent, setActiveAgent] = useState("Orion");
  const [speakingAgent, setSpeakingAgent] = useState<string | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [phase, setPhase] = useState("listening");
  const [lastIntent, setLastIntent] = useState<string>("conversation");
  const [notice, setNotice] = useState<string | null>(null);
  const [reasoning, setReasoning] = useState<ReasoningItem[]>([]);
  const [sessionId] = useState(() => {
    if (typeof window === "undefined") return "command:ssr";
    const key = "helix-command-session-id";
    const current = window.sessionStorage.getItem(key);
    if (current) return current;
    const next = `command:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;
    window.sessionStorage.setItem(key, next);
    return next;
  });
  const navigate = useNavigate();

  useEffect(() => {
    if (messages.length > 0) return;
    setMessages([
      {
        id: "welcome",
        role: "agent",
        agent: "Orion",
        at: Date.now(),
        text: "I’m Orion. HELIX is online. I can coordinate research, reasoning, risk controls, and governed actions across the worker constellation.",
        meta: `${formatCompact(kpis.availableWorkers)} workers available · ${approvals.length} owner gate${approvals.length === 1 ? "" : "s"}`,
      },
    ]);
  }, [approvals.length, kpis.availableWorkers, messages.length]);

  function speak(agentText: string, agent: string) {
    void speakAsAgent(agentText, agent, {
      onStart: () => setSpeakingAgent(agent),
      onEnd: () => setSpeakingAgent((current) => (current === agent ? null : current)),
    });
  }

  function selectAndGreet(agent: string) {
    setActiveAgent(agent);
    speak(agent === "Orion" ? "Orion here. Listening." : `This is ${agent}, reporting in.`, agent);
  }

  async function submit(raw: string, fromVoice = false) {
    const value = raw.trim();
    if (!value || planning) return;
    setText("");
    setNotice(null);
    setPhase("thinking");
    setMessages((current) => [...current, { id: `u-${Date.now()}`, role: "user", at: Date.now(), text: value }]);
    const store = useOrgStore.getState();
    store.setPlanning(true);
    try {
      const result = await orchestrateJarvis({
        data: {
          text: value,
          sessionId: sessionId,
          preferredAgent: activeAgent,
          context: {
            mission: store.identity.mission,
            orgStatus: store.orgStatus,
            routingMode: store.runtime?.routingMode ?? "auto",
            workerCount: store.workerOrder.length,
            availableWorkers: store.kpis.availableWorkers,
            activeWorkers: store.kpis.activeWorkers,
            pendingApprovals: store.approvals.filter((approval) => approval.status === "pending").length,
            successRate: store.kpis.successRate,
            quality: store.kpis.quality,
            liveMode: Boolean(store.runtime?.liveMode),
            toolRuns: store.runtime?.toolRuns ?? 0,
            recentEvents: store.events.slice(-8).map((event) => `${event.type}: ${event.what}`),
            recentConversation: messages.slice(-8).map((message) => ({ role: message.role, text: message.text, agent: message.role === "agent" ? activeAgent : undefined })),
            selectedAgent: activeAgent,
          },
        },
      });
      setActiveAgent(result.agent);
      setLastIntent(result.intent);
      setReasoning(result.reasoning ?? []);
      setPhase(result.phase);
      if (result.notice) setNotice(result.notice);
      for (const action of result.actions) {
        const decision = decideOrionAction(action, {
          userInitiated: true,
          liveTradingEnabled: Boolean(store.runtime?.liveMode),
          riskEnvelopeApproved: false,
        });
        if (!decision.allowed) {
          setNotice(`Orion action blocked: ${decision.reason}`);
          continue;
        }
        if (action.type === "select_agent") setActiveAgent(action.agent);
        if (action.type === "pause") store.pause();
        if (action.type === "resume") store.resume();
        if (action.type === "shutdown") store.shutdown();
        if (action.type === "set_routing") store.setRouting(action.mode);
        if (action.type === "issue_objective") {
          const objectiveId = store.issue(action.text, action.priority);
          const objective = useOrgStore.getState().objectives.find((candidate) => candidate.id === objectiveId);
          if (objective?.requiresApproval) setNotice(`Orion created objective ${objectiveId}; HELIX approval gate is required before activation.`);
        }
        if (action.type === "open_view") {
          const paths = {
            command: "/",
            brains: "/brains",
            workforce: "/workforce",
            governance: "/governance",
            improve: "/improve",
          } as const;
          const to = paths[action.view as keyof typeof paths];
          if (to) void navigate({ to });
        }
      }
      setMessages((current) => [
        ...current,
        {
          id: `a-${Date.now()}`,
          role: "agent",
          at: Date.now(),
          text: result.reply,
          agent: result.agent,
          meta: `${result.agent} · ${result.intent.replace(/_/g, " ")} · ${result.safety} · ${result.provider ?? "local kernel"}`,
        },
      ]);
      if (result.safety === "red") setNotice("HELIX blocked this action path under governance.");
      if (fromVoice) speak(result.reply, result.agent);
    } catch (error) {
      setPhase("blocked");
      setNotice(error instanceof Error ? error.message : "HELIX orchestration failed");
      setMessages((current) => [
        ...current,
        { id: `a-${Date.now()}`, role: "agent", at: Date.now(), text: "I could not complete the orchestration turn. No external action was claimed.", meta: "Fail-closed" },
      ]);
    } finally {
      const current = useOrgStore.getState();
      current.setPlanning(false, null);
      window.setTimeout(() => setPhase("listening"), 400);
    }
  }

  function speakLast() {
    const last = [...messages].reverse().find((message) => message.role === "agent");
    if (!last) return;
    speak(last.text, last.agent ?? activeAgent);
  }

  const runtimeLabel = runtime?.routingMode === "local-only" ? "Local brain" : "Adaptive routing";
  const phaseLabel = phase === "thinking" ? "Thinking" : phase === "acting" ? "Acting" : phase === "monitoring" ? "Monitoring" : phase === "speaking" ? "Speaking" : phase === "blocked" ? "Blocked" : "Listening";
  const stageActive = planning || orgStatus === "running";

  return (
    <div className="helix-world">
      <div className="helix-grid-overlay" />
      <div className="helix-noise" />
      <div className="helix-scanlines" />
      <div className="helix-scan-sweep" />

      <header className="relative z-20 flex items-center justify-between px-4 pb-2 pt-5 sm:px-7 sm:pt-7">
        <div className="flex items-center gap-3">
          <Sparkles className="size-4 text-cyan-200/70" />
          <div>
            <p className="text-sm font-semibold tracking-tight">HELIX</p>
            <p className="font-mono text-[9px] tracking-[0.2em] text-white/35 uppercase">Orion · trading intelligence</p>
          </div>
        </div>
        <button
          type="button"
          title="Toggle routing mode"
          onClick={() => useOrgStore.getState().setRouting(runtime?.routingMode === "local-only" ? "auto" : "local-only")}
          className="flex items-center gap-2 rounded-full border border-white/8 bg-white/[0.035] px-3 py-1.5 backdrop-blur-xl transition hover:bg-white/[0.06]"
        >
          <span className="size-1.5 rounded-full bg-cyan-300 shadow-[0_0_12px_rgba(103,232,249,0.8)]" />
          <span className="font-mono text-[10px] tracking-[0.14em] text-white/45 uppercase">{phaseLabel} · {orgStatus} · {runtimeLabel}</span>
        </button>
      </header>

      <nav className="relative z-20 flex flex-wrap items-center justify-center gap-x-1 gap-y-1.5 px-4 pb-3 sm:px-7">
        {NAV.map((n) => (
          <Link
            key={n.to}
            to={n.to}
            className="rounded-full px-2.5 py-1 font-mono text-[9px] tracking-[0.1em] text-white/40 uppercase transition hover:bg-white/[0.06] hover:text-white"
          >
            {n.label}
          </Link>
        ))}
      </nav>

      <div className="relative z-10 mx-auto max-w-[920px] px-4 pb-48 sm:px-7">
        <div className="flex flex-col items-center pb-2 pt-3 sm:pt-6">
          <OrionCouncilStage
            agents={COUNCIL_MEMBERS}
            activeAgent={activeAgent}
            speakingAgent={speakingAgent}
            active={stageActive}
            onSelectAgent={selectAndGreet}
          />
          <button
            type="button"
            onClick={() => selectAndGreet("Orion")}
            className="mt-2 flex items-center gap-2 rounded-full border border-white/8 bg-white/[0.03] px-3 py-1.5 backdrop-blur-xl transition hover:bg-white/[0.06]"
          >
            <Sparkles className="size-3 text-cyan-200/75" />
            <span className="font-mono text-[10px] tracking-[0.18em] text-white/45 uppercase">
              {activeAgent === "Orion" ? "Orion · core intelligence" : `${activeAgent} · council specialist`}
            </span>
          </button>
        </div>

        <div className="mx-auto mt-6 max-w-[660px]">
          <div className="mb-3 flex items-center justify-center gap-2 text-white/35">
            <AudioLines className="size-4" />
            <span className="font-mono text-[10px] tracking-[0.18em] uppercase">Command room · {lastIntent.replace(/_/g, " ")}</span>
          </div>
          <div className="space-y-5">
            {messages.slice(-5).map((message) => (
              <article key={message.id} className={message.role === "user" ? "ml-auto max-w-[88%]" : "max-w-[92%]"}>
                <div className={message.role === "user" ? "rounded-[1.4rem] border border-white/10 bg-white/[0.075] px-4 py-3 text-sm text-white/80" : ""}>
                  <div className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.16em] text-white/28">
                    <span>{message.role === "user" ? "You" : (message.agent ?? "HELIX")}</span>
                    <span>·</span>
                    <span>{timeAgo(message.at)}</span>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-[15px] leading-7 text-white/80 sm:text-base">{message.text}</p>
                  {message.meta ? (
                    <div className="mt-3 inline-flex rounded-full border border-white/8 bg-white/[0.03] px-3 py-1 font-mono text-[9px] tracking-[0.12em] text-white/35 uppercase">
                      {message.meta}
                    </div>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
          {planError && planning ? <p className="mt-3 text-xs text-amber-200/65">{planError}</p> : null}
          {notice ? <p className="mt-3 rounded-xl border border-amber-200/10 bg-amber-100/[0.03] px-3 py-2 text-xs leading-5 text-amber-100/65">{notice}</p> : null}
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            {QUICK_STARTERS.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setText(item)}
                className="rounded-full border border-white/8 bg-white/[0.025] px-3 py-2 text-xs text-white/40 transition hover:border-white/15 hover:bg-white/[0.05] hover:text-white/75"
              >
                {item}
              </button>
            ))}
          </div>
        </div>

        <div className="mx-auto mt-8 max-w-[720px]">
          <OrionAutonomyPanel />
        </div>

        <div className="mx-auto mt-4 max-w-[720px] rounded-[1.75rem] border border-white/8 bg-white/[0.025] p-4 backdrop-blur-xl">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-mono text-[9px] tracking-[0.18em] text-white/30 uppercase">Orion's council</p>
              <h2 className="mt-1 text-sm font-medium text-white/75">12-voice roster</h2>
            </div>
            <Badge tone="live">{formatCompact(kpis.activeWorkers)} active</Badge>
          </div>

          <div className="mt-3 grid grid-cols-4 gap-2 border-b border-white/6 pb-3">
            <Metric label="Ready" value={formatCompact(kpis.availableWorkers)} />
            <Metric label="Success" value={`${Math.round(kpis.successRate * 100)}%`} />
            <Metric label="Quality" value={`${Math.round(kpis.quality * 100)}%`} />
            <Metric label="Gates" value={String(approvals.length)} />
          </div>

          <div className="mt-3 grid gap-1.5 sm:grid-cols-2">
            {ALL_AGENTS.map((name) => {
              const trace = reasoning.find((item) => item.agent === name);
              const isActive = activeAgent === name;
              const isSpeaking = speakingAgent === name;
              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => selectAndGreet(name)}
                  className={`flex items-center gap-2 rounded-xl border px-2.5 py-2 text-left transition ${isActive ? "border-cyan-200/25 bg-cyan-200/8" : "border-white/6 bg-white/[0.02] hover:bg-white/[0.05]"}`}
                >
                  <span className={`size-1.5 shrink-0 rounded-full ${isSpeaking ? "animate-pulse bg-cyan-300 shadow-[0_0_10px_rgba(103,232,249,0.8)]" : "bg-white/25"}`} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-medium text-white/75">
                      {name}
                      {name === "Orion" ? " · lead" : ""}
                    </span>
                    <span className="block truncate text-[10px] text-white/38">{isSpeaking ? "Speaking…" : (trace?.summary ?? "Tap to select + hear voice")}</span>
                  </span>
                  <Volume2 className="size-3.5 shrink-0 text-white/30" />
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 pb-3 pt-10 sm:pb-5">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#04060a] via-[#04060a]/95 to-transparent" />
        <div className="relative px-3 sm:px-7">
        <div className="mx-auto flex max-w-[900px] items-end gap-2">
          <button
            type="button"
            aria-label="Open HELIX pages and settings"
            onClick={() => setMoreOpen(true)}
            className="mb-1 flex size-11 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] text-white/60 shadow-2xl backdrop-blur-2xl transition hover:bg-white/[0.1] hover:text-white"
          >
            <Menu className="size-4" />
          </button>
          <div className="min-w-0 flex-1">
            <VoiceComposer value={text} onChange={setText} onSubmit={() => void submit(text)} onVoiceSubmit={(value) => void submit(value, true)} onSpeak={speakLast} busy={planning} />
          </div>
        </div>
        </div>
      </div>

      {moreOpen ? (
        <div className="fixed inset-0 z-50">
          <button type="button" aria-label="Close" className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setMoreOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 max-h-[75vh] overflow-y-auto rounded-t-[2rem] border-t border-white/10 bg-[#07080a] p-5 pb-8 shadow-2xl">
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-white/15" />
            <div className="mb-4 flex items-center justify-between">
              <p className="text-sm font-medium text-white/80">HELIX pages &amp; settings</p>
              <button type="button" onClick={() => setMoreOpen(false)} className="flex size-8 items-center justify-center rounded-full bg-white/[0.06] text-white/50 hover:text-white">
                <X className="size-4" />
              </button>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {NAV_GROUPS.map((group) => (
                <div key={group}>
                  <p className="mb-2 font-mono text-[9px] tracking-[0.18em] text-white/30 uppercase">{group}</p>
                  <div className="space-y-1">
                    {NAV.filter((n) => n.group === group).map((n) => {
                      const Icon = n.icon;
                      return (
                        <Link
                          key={n.to}
                          to={n.to}
                          onClick={() => setMoreOpen(false)}
                          className="flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-xs text-white/55 transition hover:bg-white/[0.06] hover:text-white"
                        >
                          <Icon className="size-3.5" /> {n.label}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/6 bg-white/[0.025] px-2 py-2">
      <p className="font-mono text-[8px] tracking-[0.12em] text-white/28 uppercase">{label}</p>
      <p className="mt-0.5 text-sm font-medium tracking-tight text-white/75">{value}</p>
    </div>
  );
}

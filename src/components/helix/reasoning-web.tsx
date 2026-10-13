import { useMemo } from "react";
import { cn } from "@/lib/utils";

const AGENTS = [
  { name: "Orion", x: 50, y: 18, tone: "lead" },
  { name: "Lyra", x: 18, y: 36, tone: "cool" },
  { name: "Nova", x: 82, y: 36, tone: "cool" },
  { name: "Atlas", x: 13, y: 68, tone: "warm" },
  { name: "Polaris", x: 86, y: 68, tone: "warm" },
  { name: "Nebula", x: 29, y: 87, tone: "cool" },
  { name: "Titan", x: 71, y: 87, tone: "cool" },
  { name: "Cassini", x: 50, y: 66, tone: "center" },
  { name: "Astra", x: 36, y: 52, tone: "warm" },
  { name: "Mira", x: 64, y: 52, tone: "warm" },
  { name: "Selene", x: 50, y: 94, tone: "cool" },
];

export function ReasoningWeb({
  activeAgent = "Orion",
  mentions = [],
  speakingAgent = null,
  onSelectAgent,
  className,
}: {
  activeAgent?: string;
  mentions?: string[];
  speakingAgent?: string | null;
  onSelectAgent?: (agent: string) => void;
  className?: string;
}) {
  const links = useMemo(
    () => [
      [50, 18, 18, 36],
      [50, 18, 82, 36],
      [18, 36, 13, 68],
      [82, 36, 86, 68],
      [13, 68, 29, 87],
      [86, 68, 71, 87],
      [29, 87, 50, 94],
      [71, 87, 50, 94],
      [50, 66, 36, 52],
      [50, 66, 64, 52],
      [36, 52, 18, 36],
      [64, 52, 82, 36],
      [36, 52, 50, 18],
      [64, 52, 50, 18],
      [50, 66, 50, 18],
    ],
    [],
  );

  return (
    <div className={cn("relative aspect-[4/3] w-full overflow-hidden rounded-[2rem] border border-white/8 bg-black/20", className)}>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
        {links.map(([x1, y1, x2, y2], index) => (
          <line
            key={`${x1}-${y1}-${x2}-${y2}-${index}`}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke="rgba(130, 223, 232, 0.16)"
            strokeWidth="0.35"
          />
        ))}
      </svg>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(60,210,230,0.08),transparent_45%)]" />
      {AGENTS.map((agent) => (
        <button
          key={agent.name}
          type="button"
          onClick={() => onSelectAgent?.(agent.name)}
          aria-label={`Select ${agent.name}`}
          className="absolute -translate-x-1/2 -translate-y-1/2 rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200/50"
          style={{ left: `${agent.x}%`, top: `${agent.y}%` }}
        >
          <div
            className={cn(
              "mx-auto flex size-3.5 items-center justify-center rounded-full border border-cyan-200/30 shadow-[0_0_22px_rgba(76,222,236,0.2)]",
              agent.name === activeAgent && "size-5 border-cyan-100/60 shadow-[0_0_32px_rgba(76,222,236,0.5)]",
              mentions.includes(agent.name) && "ring-2 ring-violet-200/35",
              agent.name === speakingAgent && "size-6 border-cyan-100/85 shadow-[0_0_42px_rgba(76,222,236,0.75)] animate-pulse",
              agent.tone === "lead" && "bg-cyan-300/70",
              agent.tone === "cool" && "bg-sky-300/45",
              agent.tone === "warm" && "bg-violet-300/45",
              agent.tone === "center" && "bg-white/50",
            )}
          />
          <span className="mt-1 block whitespace-nowrap text-center font-mono text-[9px] tracking-[0.08em] text-white/55">
            {agent.name}
          </span>
        </button>
      ))}
      <div className="absolute left-4 top-4 rounded-full border border-white/8 bg-white/[0.03] px-3 py-1 font-mono text-[9px] tracking-[0.18em] text-white/40 uppercase">
        Reasoning constellation
      </div>
    </div>
  );
}

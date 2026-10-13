import type { CSSProperties } from "react";
import { OrionBeing } from "@/components/helix/orion-being";
import { cn } from "@/lib/utils";

type OrbitVars = CSSProperties & Record<`--${string}`, string>;

const ORBIT_DURATION = "150s";

function pointOnCircle(radiusPercent: number, angleDeg: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    left: `${50 + radiusPercent * Math.cos(rad)}%`,
    top: `${50 + radiusPercent * Math.sin(rad)}%`,
  };
}

export function OrionCouncilStage({
  agents,
  activeAgent,
  speakingAgent = null,
  active = false,
  onSelectAgent,
  className,
}: {
  /** Council members orbiting Orion — Orion itself is the fixed core and should not be included. */
  agents: string[];
  activeAgent: string;
  speakingAgent?: string | null;
  active?: boolean;
  onSelectAgent: (agent: string) => void;
  className?: string;
}) {
  const total = agents.length || 1;
  const layerStyle: OrbitVars = { "--orbit-duration": ORBIT_DURATION };

  return (
    <div className={cn("orion-stage", className)} aria-label="Orion and council">
      <div className="orion-orbit-layer" style={layerStyle}>
        {agents.map((name, index) => {
          const isActive = activeAgent === name;
          const isSpeaking = speakingAgent === name;
          const angle = (360 / total) * index - 90;
          const { left, top } = pointOnCircle(42, angle);
          return (
            <div key={name} className="orion-orbit-node" style={{ left, top }}>
              <div className="orion-orbit-counter" style={layerStyle}>
                <button
                  type="button"
                  onClick={() => onSelectAgent(name)}
                  aria-label={`Select ${name}`}
                  className={cn(
                    "orion-orbit-button",
                    isActive && "orion-orbit-button-active",
                    isSpeaking && "orion-orbit-button-speaking",
                  )}
                >
                  <span className="orion-orbit-badge">
                    <span className="orion-orbit-badge-ring" />
                    <span className="orion-orbit-badge-core">{name.charAt(0)}</span>
                  </span>
                  <span className="orion-orbit-label">{name}</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="orion-stage-core">
        <OrionBeing active={active || speakingAgent === "Orion"} className="size-full" />
      </div>
    </div>
  );
}

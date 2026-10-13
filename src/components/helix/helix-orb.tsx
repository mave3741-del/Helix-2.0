import { useMemo, type CSSProperties } from "react";
import { cn } from "@/lib/utils";

type OrbitVars = CSSProperties & Record<`--${string}`, string>;

const TICK_COUNT = 72;
const MAJOR_EVERY = 6;
const WAVE_BARS = 9;

const SATELLITES: Array<{ id: string; radius: number; angle: number; duration: string; reverse?: boolean }> = [
  { id: "s1", radius: 45, angle: 20, duration: "24s" },
  { id: "s2", radius: 45, angle: 200, duration: "24s" },
  { id: "s3", radius: 37, angle: 110, duration: "33s", reverse: true },
];

function pointOnCircle(radiusPercent: number, angleDeg: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    left: `${50 + radiusPercent * Math.cos(rad)}%`,
    top: `${50 + radiusPercent * Math.sin(rad)}%`,
  };
}

function polar(cx: number, cy: number, r: number, deg: number) {
  const rad = (deg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

export function HelixOrb({ active = false, className }: { active?: boolean; className?: string }) {
  const ticks = useMemo(() => Array.from({ length: TICK_COUNT }, (_, i) => i), []);
  const waveform = useMemo(() => Array.from({ length: WAVE_BARS }, (_, i) => i), []);

  return (
    <div className={cn("helix-orb", active && "helix-orb-active", className)} aria-label="Orion intelligence core">
      <div className="helix-orb-halo" />

      <svg className="helix-orb-dial" viewBox="0 0 200 200" aria-hidden="true">
        <circle cx="100" cy="100" r="97" className="helix-orb-dial-track" />
        <g className="helix-orb-ticks">
          {ticks.map((i) => {
            const angle = (360 / TICK_COUNT) * i;
            const major = i % MAJOR_EVERY === 0;
            const outer = polar(100, 100, 97, angle);
            const inner = polar(100, 100, major ? 88 : 92, angle);
            return (
              <line
                key={i}
                x1={outer.x}
                y1={outer.y}
                x2={inner.x}
                y2={inner.y}
                className={major ? "helix-orb-tick helix-orb-tick-major" : "helix-orb-tick"}
              />
            );
          })}
        </g>
      </svg>

      <div className="helix-orb-ring helix-orb-ring-1" />
      <div className="helix-orb-ring helix-orb-ring-2" />
      <div className="helix-orb-ring helix-orb-ring-3" />
      <div className="helix-orb-ring helix-orb-ring-4" />

      {SATELLITES.map((s) => {
        const layerStyle: OrbitVars = { "--orbit-duration": s.duration };
        const { left, top } = pointOnCircle(s.radius, s.angle);
        return (
          <div
            key={s.id}
            className={cn("helix-orb-satellite-layer", s.reverse && "helix-orb-satellite-layer-reverse")}
            style={layerStyle}
          >
            <div className="helix-orb-satellite" style={{ left, top }}>
              <span className="helix-orb-satellite-dot" />
            </div>
          </div>
        );
      })}

      <div className="helix-orb-core">
        <div className="helix-orb-wave" aria-hidden="true">
          {waveform.map((i) => (
            <span key={i} className="helix-orb-wave-bar" style={{ animationDelay: `${i * 0.09}s` }} />
          ))}
        </div>
      </div>
      <div className="helix-orb-scan" />
    </div>
  );
}

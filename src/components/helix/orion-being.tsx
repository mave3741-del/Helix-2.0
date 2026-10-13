import { useMemo } from "react";
import { cn } from "@/lib/utils";

const CX = 150;
const CY = 150;

const OUTER_RINGS = Array.from({ length: 8 }, (_, i) => i * 22.5);
const INNER_RINGS = Array.from({ length: 6 }, (_, i) => i * 30);

const NEBULA_BLOBS = [
  { cx: 95, cy: 75, r: 110, color: "#7c5cff", opacity: 0.28, delay: "0s" },
  { cx: 215, cy: 215, r: 115, color: "#1fd8ff", opacity: 0.24, delay: "-3s" },
  { cx: 75, cy: 225, r: 95, color: "#ff5bc7", opacity: 0.18, delay: "-6s" },
  { cx: 225, cy: 80, r: 95, color: "#2af0b0", opacity: 0.18, delay: "-9s" },
];

function sineWavePath(radius: number, amplitude: number, cycles: number, phase: number, points = 140) {
  const pts: Array<[number, number]> = [];
  for (let i = 0; i <= points; i += 1) {
    const t = i / points;
    const ang = t * Math.PI * 2;
    const r = radius + amplitude * Math.sin(cycles * ang + phase);
    pts.push([CX + r * Math.cos(ang), CY + r * Math.sin(ang)]);
  }
  return pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
}

/**
 * Orion's core visual — nebula-lit rotating "flower" of elliptical orbits,
 * with two woven sine-wave rings around the outside and soft energy ripples
 * pulsing from the core. Every piece verified by rendering a static pose
 * (cairosvg) before this was written — see the preview images shared in chat.
 */
export function OrionBeing({ active = false, className }: { active?: boolean; className?: string }) {
  const outer = useMemo(() => OUTER_RINGS, []);
  const inner = useMemo(() => INNER_RINGS, []);
  const waveA = useMemo(() => sineWavePath(134, 10, 9, 0), []);
  const waveB = useMemo(() => sineWavePath(126, 7, 9, 3.4), []);
  const ripples = useMemo(() => [50, 97, 145], []);

  return (
    <div className={cn("orion-being", active && "orion-being-active", className)} aria-label="Orion">
      <svg viewBox="0 0 300 300" className="orion-being-svg" aria-hidden="true">
        <defs>
          <filter id="ob-blur"><feGaussianBlur stdDeviation="22" /></filter>
          <radialGradient id="ob-core" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="1" />
            <stop offset="32%" stopColor="#cfeaff" stopOpacity="0.9" />
            <stop offset="68%" stopColor="#5fb8ff" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#5fb8ff" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="ob-halo" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#3f7dff" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#3f7dff" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="ob-wave-a" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.95" />
            <stop offset="50%" stopColor="#c4b5fd" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#22d3ee" stopOpacity="0.95" />
          </linearGradient>
          <linearGradient id="ob-wave-b" x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#ffd39b" stopOpacity="0.85" />
            <stop offset="50%" stopColor="#ff9bd2" stopOpacity="0.6" />
            <stop offset="100%" stopColor="#ffd39b" stopOpacity="0.85" />
          </linearGradient>
        </defs>

        <g className="orion-being-nebula">
          {NEBULA_BLOBS.map((b, i) => (
            <circle
              key={i}
              cx={b.cx}
              cy={b.cy}
              r={b.r}
              fill={b.color}
              opacity={b.opacity}
              filter="url(#ob-blur)"
              style={{ animationDelay: b.delay }}
            />
          ))}
        </g>

        <circle className="orion-being-halo" cx={CX} cy={CY} r="140" fill="url(#ob-halo)" />

        <g className="orion-being-ripples">
          {ripples.map((r, i) => (
            <circle key={r} cx={CX} cy={CY} r={r} style={{ animationDelay: `${i * 1.3}s` }} />
          ))}
        </g>

        <g className="orion-being-ring-outer">
          {outer.map((angle) => (
            <ellipse
              key={angle}
              cx={CX}
              cy={CY}
              rx="112"
              ry="32"
              transform={`rotate(${angle} ${CX} ${CY})`}
              className="orion-being-orbit orion-being-orbit-outer"
            />
          ))}
        </g>

        <g className="orion-being-ring-inner">
          {inner.map((angle) => (
            <ellipse
              key={angle}
              cx={CX}
              cy={CY}
              rx="74"
              ry="21"
              transform={`rotate(${angle} ${CX} ${CY})`}
              className="orion-being-orbit orion-being-orbit-inner"
            />
          ))}
        </g>

        <g className="orion-being-wave-group-a">
          <path d={waveA} className="orion-being-wave-line" stroke="url(#ob-wave-a)" />
        </g>
        <g className="orion-being-wave-group-b">
          <path d={waveB} className="orion-being-wave-line" stroke="url(#ob-wave-b)" />
        </g>

        <circle className="orion-being-core" cx={CX} cy={CY} r="26" fill="url(#ob-core)" />
        <circle className="orion-being-core-dot" cx={CX} cy={CY} r="10" />
      </svg>
    </div>
  );
}

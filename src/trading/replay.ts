import type { Bar, Signal } from "@/runtime/tools/trading";

export interface ReplayEvent {
  ts: number;
  bar: Bar;
}

export interface ReplayDecision {
  ts: number;
  signal: Signal;
  close: number;
  nextReturn: number;
}

export function replayBars(
  bars: Bar[],
  decide: (history: Bar[], index: number) => Signal,
): ReplayDecision[] {
  const ordered = [...bars].sort((a, b) => a.ts - b.ts);
  const out: ReplayDecision[] = [];
  for (let i = 0; i < ordered.length - 1; i += 1) {
    const current = ordered[i];
    const next = ordered[i + 1];
    const signal = decide(ordered.slice(0, i + 1), i);
    const nextReturn = current.close > 0 ? next.close / current.close - 1 : 0;
    out.push({ ts: current.ts, signal, close: current.close, nextReturn });
  }
  return out;
}

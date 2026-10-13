import type { MarketSnapshot } from "./market-scanner";
export interface RegimeTriggerConfig { volatilityThreshold: number; staleAfterMs: number; highSpreadBps: number; minimumStressMarkets: number; }
const DEFAULTS: RegimeTriggerConfig = { volatilityThreshold: 0.08, staleAfterMs: 90_000, highSpreadBps: 100, minimumStressMarkets: 10 };
export function shouldUseHighVolatilityMode(markets: MarketSnapshot[], now = Date.now(), config: Partial<RegimeTriggerConfig> = {}): boolean {
  const c={...DEFAULTS,...config};
  const fresh=markets.filter(m=>Number.isFinite(m.timestamp)&&now-m.timestamp>=0&&now-m.timestamp<=c.staleAfterMs);
  const stressed=fresh.filter(m=>(m.volatility ?? 0)>=c.volatilityThreshold || (m.spreadBps ?? 0)>=c.highSpreadBps);
  return stressed.length >= Math.min(c.minimumStressMarkets, Math.max(1,fresh.length));
}

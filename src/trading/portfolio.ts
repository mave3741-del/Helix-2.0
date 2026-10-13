export interface Exposure {
  symbol: string;
  notional: number;
  side: "long" | "short";
  sector?: string;
  market?: string;
}

export interface PortfolioLimitResult {
  ok: boolean;
  grossNotional: number;
  netNotional: number;
  concentration: number;
  reasons: string[];
}

export function checkPortfolioLimits(
  exposures: Exposure[],
  equity: number,
  maxGrossPct = 2,
  maxNetPct = 1,
  maxSinglePct = 0.25,
): PortfolioLimitResult {
  const reasons: string[] = [];
  if (!(equity > 0)) reasons.push("invalid_equity");
  const abs = exposures.map((x) => Math.abs(x.notional));
  const grossNotional = abs.reduce((a, b) => a + b, 0);
  const netNotional = exposures.reduce((s, x) => s + (x.side === "long" ? x.notional : -x.notional), 0);
  const maxSingle = Math.max(0, ...abs);
  const concentration = equity > 0 ? maxSingle / equity : Infinity;
  if (equity > 0 && grossNotional > equity * maxGrossPct) reasons.push("gross_exposure_exceeded");
  if (equity > 0 && Math.abs(netNotional) > equity * maxNetPct) reasons.push("net_exposure_exceeded");
  if (equity > 0 && concentration > maxSinglePct) reasons.push("single_position_concentration");
  return { ok: reasons.length === 0, grossNotional, netNotional, concentration, reasons };
}

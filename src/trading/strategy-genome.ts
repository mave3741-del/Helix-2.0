export interface StrategyGenome {
  id: string;
  family: string;
  market: string;
  timeframe: string;
  features: string[];
  params: Record<string, number>;
  createdFrom?: string;
  version: number;
}

export interface MutationPolicy {
  maxParamDelta: number;
  maxFeatures: number;
}

export function mutateStrategy(base: StrategyGenome, seed: number, policy: MutationPolicy = { maxParamDelta: 0.2, maxFeatures: 12 }): StrategyGenome {
  const frac = ((Math.sin(seed * 12.9898) * 43758.5453) % 1 + 1) % 1;
  const features = [...new Set(base.features)].slice(0, policy.maxFeatures);
  const params: Record<string, number> = {};
  for (const [key, value] of Object.entries(base.params)) {
    const direction = frac > 0.5 ? 1 : -1;
    const scale = 1 + direction * policy.maxParamDelta * (0.5 + frac / 2);
    params[key] = Math.max(0, value * scale);
  }
  return {
    ...base,
    id: `${base.id}.m${base.version + 1}`,
    createdFrom: base.id,
    params,
    features,
    version: base.version + 1,
  };
}

export function strategyFingerprint(strategy: StrategyGenome): string {
  const features = [...strategy.features].sort().join(",");
  const params = Object.entries(strategy.params).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join(",");
  return `${strategy.family}|${strategy.market}|${strategy.timeframe}|${features}|${params}`;
}

import { attributeExecutionQuality, type ExecutionFill, type ExecutionQuality } from './execution-intelligence.ts';

export interface ExecutionQualityFeedback {
  strategyId: string;
  symbol: string;
  quality: ExecutionQuality;
  executionAdjustment: number;
  action: 'improve' | 'maintain' | 'throttle';
}

export function buildExecutionQualityFeedback(input: { strategyId: string; symbol: string; requestedQty: number; benchmarkPrice: number; fills: ExecutionFill[] }): ExecutionQualityFeedback {
  const quality = attributeExecutionQuality(input);
  if (quality.fillRate < 0.8 || quality.qualityScore < 60) return { strategyId: input.strategyId, symbol: input.symbol, quality, executionAdjustment: -0.15, action: 'throttle' };
  if (quality.qualityScore >= 85) return { strategyId: input.strategyId, symbol: input.symbol, quality, executionAdjustment: 0.05, action: 'improve' };
  return { strategyId: input.strategyId, symbol: input.symbol, quality, executionAdjustment: 0, action: 'maintain' };
}

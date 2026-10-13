import type { Worker } from "@/org/types";
import { builtInTradingTools, type GeneratedToolSpec, type NativeToolRecord } from "./factory.ts";
import { toolsForPermissions, type ToolName } from "./runtime.ts";

/**
 * Deterministic capability -> native-tool grants.
 * A capability never grants shell/network/wallet access; these are native tools only.
 */
const CAPABILITY_TOOLS: Record<string, ToolName[]> = {
  "market-data": ["native.market.snapshot", "native.technical.signal", "native.rsi", "native.atr", "native.zscore"],
  "microstructure": ["native.market.snapshot", "native.technical.signal"],
  "technical": ["native.technical.signal", "native.rsi", "native.atr"],
  "quant": ["native.zscore", "native.regime.classify", "native.strategy.score"],
  "regime-analysis": ["native.regime.classify"],
  "strategy": ["native.strategy.score", "native.strategy.mutate", "native.backtest"],
  "backtest": ["native.backtest", "native.strategy.score"],
  "validation": ["native.pit.validate", "native.data.quality", "native.strategy.score"],
  "data-quality": ["native.data.quality", "native.pit.validate"],
  "on-chain": ["native.whale.signal"],
  "entity-intelligence": ["native.whale.signal"],
  "risk": ["native.risk.check", "native.position.size", "native.portfolio.check"],
  "portfolio": ["native.position.size", "native.portfolio.check"],
  "execution": ["native.paper.order"],
  "research": ["native.backtest", "native.strategy.score", "native.zscore", "native.regime.classify", "native.whale.signal", "native.pit.validate", "native.data.quality", "native.strategy.mutate"],
};

const TOOL_SET = new Set<ToolName>(builtInTradingTools().map((tool) => tool.id as ToolName));

export interface NativeToolCapabilityGrant {
  tool: GeneratedToolSpec;
  capabilities: string[];
}

export function nativeToolsForCapabilities(capabilities: string[], allowed: ToolName[] = [], registry?: Map<string, NativeToolRecord>): ToolName[] {
  const requested = new Set<string>();
  for (const capability of capabilities) {
    for (const tool of CAPABILITY_TOOLS[capability] ?? []) requested.add(tool);
  }
  const permissionSet = new Set<ToolName>(allowed);
  return [...requested]
    .filter((name): name is ToolName => TOOL_SET.has(name as ToolName))
    .filter((name) => allowed.length === 0 || permissionSet.has(name))
    .filter((name) => !registry || registry.get(name)?.lifecycle === "deployed")
    .sort();
}

export function nativeToolsForWorker(worker: Pick<Worker, "capabilities" | "toolPermissions">, registry?: Map<string, NativeToolRecord>): ToolName[] {
  return nativeToolsForCapabilities(worker.capabilities, toolsForPermissions(worker.toolPermissions), registry);
}

export function nativeCapabilityGrants(capabilities: string[], allowed: ToolName[] = [], registry?: Map<string, NativeToolRecord>): NativeToolCapabilityGrant[] {
  const grants = new Map<string, string[]>();
  for (const capability of capabilities) {
    for (const toolName of CAPABILITY_TOOLS[capability] ?? []) {
      if (!TOOL_SET.has(toolName)) continue;
      if (allowed.length > 0 && !allowed.includes(toolName)) continue;
      if (registry && registry.get(toolName)?.lifecycle !== "deployed") continue;
      const list = grants.get(toolName) ?? [];
      list.push(capability);
      grants.set(toolName, list);
    }
  }
  return builtInTradingTools()
    .filter((tool) => grants.has(tool.id))
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((tool) => ({ tool, capabilities: [...new Set(grants.get(tool.id) ?? [])].sort() }));
}

export function isNativeToolAllowedForWorker(name: string, worker: Pick<Worker, "capabilities" | "toolPermissions">, registry?: Map<string, NativeToolRecord>): boolean {
  return nativeToolsForWorker(worker, registry).includes(name as ToolName);
}

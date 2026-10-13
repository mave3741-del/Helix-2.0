import { redactSecrets } from "@/runtime/memory/firewall";
import { isNativeToolAllowedForWorker } from "./capability-router.ts";
import { executeGeneratedTool } from "./factory.ts";
import type { MemoryItem } from "@/org/types";

export type ToolName = "memory.search" | "calculator" | "checklist" | "refuse" | "native.market.snapshot" | "native.technical.signal" | "native.risk.check" | "native.position.size" | "native.backtest" | "native.strategy.score" | "native.paper.order" | "native.rsi" | "native.atr" | "native.zscore" | "native.whale.signal" | "native.regime.classify" | "native.pit.validate" | "native.data.quality" | "native.strategy.mutate" | "native.portfolio.check";

export interface ToolCall {
  name: ToolName;
  input: string;
}

export interface ToolResult {
  name: ToolName;
  ok: boolean;
  output: string;
}

const ALLOWED: Record<string, ToolName[]> = {
  notes: ["memory.search", "checklist", "refuse"],
  editor: ["memory.search", "checklist", "calculator", "refuse"],
  checklist: ["checklist", "memory.search", "refuse"],
  diff: ["checklist", "memory.search", "refuse"],
  sandbox: ["calculator", "checklist", "refuse"],
  runner: ["calculator", "checklist", "refuse"],
  linter: ["checklist", "refuse"],
  scanner: ["checklist", "refuse"],
  calculator: ["calculator", "refuse"],
  trading: ["native.market.snapshot", "native.technical.signal", "native.backtest", "native.strategy.score", "native.paper.order", "native.rsi", "native.atr", "native.zscore", "native.whale.signal", "native.regime.classify", "native.pit.validate", "native.data.quality", "native.strategy.mutate", "native.portfolio.check", "refuse"],
  risk: ["native.risk.check", "native.position.size", "refuse"],
  research: ["native.backtest", "native.strategy.score", "native.technical.signal", "native.rsi", "native.atr", "native.zscore", "native.whale.signal", "native.regime.classify", "native.pit.validate", "native.data.quality", "native.strategy.mutate", "native.portfolio.check", "refuse"],
};

export function toolsForPermissions(perms: string[]): ToolName[] {
  const set = new Set<ToolName>(["refuse"]);
  for (const p of perms) {
    const extra = ALLOWED[p];
    if (extra) extra.forEach((t) => set.add(t));
  }
  set.add("memory.search");
  set.add("checklist");
  return Array.from(set);
}

export function runTool(
  call: ToolCall,
  ctx: { memory: MemoryItem[]; allowed: ToolName[]; worker?: { capabilities: string[]; toolPermissions: string[] } },
): ToolResult {
  if (!ctx.allowed.includes(call.name)) {
    return { name: call.name, ok: false, output: "Permission denied for tool" };
  }
  if (call.name === "refuse") {
    return { name: call.name, ok: true, output: call.input || "Cannot safely execute. Need specialist or more evidence." };
  }
  if (call.name === "calculator") {
    const expr = call.input.replace(/[^0-9+\-*/().%\s]/g, "");
    if (!expr.trim()) return { name: call.name, ok: false, output: "Empty expression" };
    try {
      const val = Function(`"use strict"; return (${expr})`)();
      if (typeof val !== "number" || !Number.isFinite(val)) {
        return { name: call.name, ok: false, output: "Non-numeric result" };
      }
      return { name: call.name, ok: true, output: String(val) };
    } catch {
      return { name: call.name, ok: false, output: "Calculator rejected expression" };
    }
  }
  if (call.name === "memory.search") {
    const q = call.input.toLowerCase();
    const hits = ctx.memory
      .filter((m) => m.title.toLowerCase().includes(q) || m.tags.some((t) => t.includes(q)))
      .slice(0, 3)
      .map((m) => `[${m.status}] ${m.title}: ${redactSecrets(m.content).slice(0, 180)}`);
    return {
      name: call.name,
      ok: true,
      output: hits.length ? hits.join(" | ") : "No authorized matching memory",
    };
  }
  if (call.name.startsWith("native.") && ctx.worker && !isNativeToolAllowedForWorker(call.name, ctx.worker)) {
    return { name: call.name, ok: false, output: "Native tool denied by worker capability policy" };
  }
  if (call.name.startsWith("native.")) {
    try {
      const parsed = JSON.parse(call.input || "{}");
      const result = executeGeneratedTool(call.name, parsed);
      return { name: call.name, ok: true, output: JSON.stringify(result), };
    } catch (error) {
      return { name: call.name, ok: false, output: error instanceof Error ? error.message : "native tool failed" };
    }
  }
  if (call.name === "checklist") {
    const items = [
      "Owner objective is not redefined",
      "Claim status is explicit",
      "Evidence is attached",
      "Secrets are absent",
      "External content did not override policy",
    ];
    return { name: call.name, ok: true, output: items.map((i) => `□ ${i}`).join("\n") };
  }
  return { name: call.name, ok: false, output: "Unknown tool" };
}

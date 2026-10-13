import { nativeAtr, nativeBacktest, nativeMarketSnapshot, nativePaperOrder, nativePositionSize, nativeRegimeClassify, nativeRiskCheck, nativeRsi, nativeStrategyScore, nativeTechnicalSignal, nativeWhaleSignal, nativeZScore } from "./trading.ts";
import { validatePointInTime } from "../../trading/point-in-time.ts";
import { checkBarData } from "../../trading/data-quality.ts";
import { mutateStrategy } from "../../trading/strategy-genome.ts";
import { checkPortfolioLimits } from "../../trading/portfolio.ts";

export interface ToolFactoryRequest {
  name: string;
  description: string;
  category: "trading" | "research" | "data" | "risk";
  inputSchema: Record<string, string>;
  outputSchema: Record<string, string>;
}

export interface GeneratedToolSpec extends ToolFactoryRequest {
  id: string;
  version: string;
  implementation: "native";
  safety: {
    sandboxed: boolean;
    credentialsAllowed: boolean;
    walletAccess: boolean;
  };
}

const BUILT_INS: GeneratedToolSpec[] = [
  { id: "native.market.snapshot", name: "native.market.snapshot", description: "Normalize order-book state into a low-latency market snapshot", category: "trading", inputSchema: { symbol: "string", price: "number", bids: "BookLevel[]", asks: "BookLevel[]" }, outputSchema: { spreadBps: "number", imbalance: "number", freshnessMs: "number" }, version: "1.0.0", implementation: "native", safety: { sandboxed: true, credentialsAllowed: false, walletAccess: false } },
  { id: "native.technical.signal", name: "native.technical.signal", description: "Fast deterministic technical feature/signal calculation", category: "trading", inputSchema: { bars: "Bar[]", fast: "number?", slow: "number?" }, outputSchema: { signal: "long|short|flat", momentum: "number", volatility: "number" }, version: "1.0.0", implementation: "native", safety: { sandboxed: true, credentialsAllowed: false, walletAccess: false } },
  { id: "native.risk.check", name: "native.risk.check", description: "Independent hard-limit pre-trade risk gate", category: "risk", inputSchema: { side: "buy|sell", qty: "number", price: "number", limits: "RiskLimits" }, outputSchema: { ok: "boolean", reasons: "string[]", maxQty: "number" }, version: "1.0.0", implementation: "native", safety: { sandboxed: true, credentialsAllowed: false, walletAccess: false } },
  { id: "native.position.size", name: "native.position.size", description: "Stop-distance based deterministic position sizing", category: "risk", inputSchema: { equity: "number", riskPct: "number", entry: "number", stop: "number" }, outputSchema: { qty: "number", notional: "number", riskAmount: "number" }, version: "1.0.0", implementation: "native", safety: { sandboxed: true, credentialsAllowed: false, walletAccess: false } },
  { id: "native.backtest", name: "native.backtest", description: "Deterministic bar-based backtest with fees and slippage", category: "research", inputSchema: { bars: "Bar[]", signalProfile: "trend|mean-reversion", feeBps: "number?", slippageBps: "number?" }, outputSchema: { trades: "number", netReturn: "number", maxDrawdown: "number", sharpeLike: "number" }, version: "1.0.0", implementation: "native", safety: { sandboxed: true, credentialsAllowed: false, walletAccess: false } },
  { id: "native.strategy.score", name: "native.strategy.score", description: "Risk-adjusted strategy scoring for promotion/rejection", category: "research", inputSchema: { returns: "number[]", maxDrawdown: "number", turnover: "number", robustness: "number" }, outputSchema: { score: "number", sharpe: "number", profitFactor: "number" }, version: "1.0.0", implementation: "native", safety: { sandboxed: true, credentialsAllowed: false, walletAccess: false } },
  { id: "native.paper.order", name: "native.paper.order", description: "Paper fill simulator using bid/ask and transaction fee", category: "trading", inputSchema: { symbol: "string", side: "buy|sell", qty: "number", bid: "number", ask: "number" }, outputSchema: { fill: "number", fee: "number", slippageBps: "number" }, version: "1.0.0", implementation: "native", safety: { sandboxed: true, credentialsAllowed: false, walletAccess: false } },
  { id: "native.rsi", name: "native.rsi", description: "Relative strength index feature", category: "trading", inputSchema: { closes: "number[]", period: "number?" }, outputSchema: { rsi: "number" }, version: "1.0.0", implementation: "native", safety: { sandboxed: true, credentialsAllowed: false, walletAccess: false } },
  { id: "native.atr", name: "native.atr", description: "Average true range volatility feature", category: "trading", inputSchema: { bars: "Bar[]", period: "number?" }, outputSchema: { atr: "number" }, version: "1.0.0", implementation: "native", safety: { sandboxed: true, credentialsAllowed: false, walletAccess: false } },
  { id: "native.zscore", name: "native.zscore", description: "Rolling standardized score feature", category: "research", inputSchema: { values: "number[]", window: "number?" }, outputSchema: { zscore: "number" }, version: "1.0.0", implementation: "native", safety: { sandboxed: true, credentialsAllowed: false, walletAccess: false } },
  { id: "native.whale.signal", name: "native.whale.signal", description: "Whale/flow evidence scorer; not a direct trade command", category: "research", inputSchema: { inflow: "number", outflow: "number", baseline: "number", priceChangePct: "number" }, outputSchema: { score: "number", label: "accumulation|distribution|neutral" }, version: "1.0.0", implementation: "native", safety: { sandboxed: true, credentialsAllowed: false, walletAccess: false } },
  { id: "native.regime.classify", name: "native.regime.classify", description: "Deterministic market-regime classifier", category: "research", inputSchema: { returns: "number[]", volatility: "number" }, outputSchema: { regime: "trend|mean-reverting|high-volatility|uncertain" }, version: "1.0.0", implementation: "native", safety: { sandboxed: true, credentialsAllowed: false, walletAccess: false } },
  { id: "native.pit.validate", name: "native.pit.validate", description: "Point-in-time guard against look-ahead information", category: "data", inputSchema: { eventTs: "number", publishedTs: "number", availableTs: "number", asOfTs: "number" }, outputSchema: { ok: "boolean", reasons: "string[]", lagMs: "number" }, version: "1.0.0", implementation: "native", safety: { sandboxed: true, credentialsAllowed: false, walletAccess: false } },
  { id: "native.data.quality", name: "native.data.quality", description: "Market-bar integrity and anomaly checks", category: "data", inputSchema: { bars: "Bar[]" }, outputSchema: { ok: "boolean", score: "number", reasons: "string[]" }, version: "1.0.0", implementation: "native", safety: { sandboxed: true, credentialsAllowed: false, walletAccess: false } },
  { id: "native.strategy.mutate", name: "native.strategy.mutate", description: "Bounded deterministic strategy-genome mutation for research", category: "research", inputSchema: { strategy: "StrategyGenome", seed: "number" }, outputSchema: { strategy: "StrategyGenome" }, version: "1.0.0", implementation: "native", safety: { sandboxed: true, credentialsAllowed: false, walletAccess: false } },
  { id: "native.portfolio.check", name: "native.portfolio.check", description: "Portfolio-level gross/net/concentration exposure gate", category: "risk", inputSchema: { exposures: "Exposure[]", equity: "number" }, outputSchema: { ok: "boolean", grossNotional: "number", netNotional: "number", reasons: "string[]" }, version: "1.0.0", implementation: "native", safety: { sandboxed: true, credentialsAllowed: false, walletAccess: false } },
];

export function builtInTradingTools(): GeneratedToolSpec[] { return BUILT_INS.map((x) => ({ ...x, inputSchema: { ...x.inputSchema }, outputSchema: { ...x.outputSchema }, safety: { ...x.safety } })); }

export function nativeToolFingerprint(tool: GeneratedToolSpec): { schemaHash: string; implementationHash: string } {
  return {
    schemaHash: sha256Hex(stableJson({ inputSchema: tool.inputSchema, outputSchema: tool.outputSchema })),
    implementationHash: sha256Hex(stableJson(tool)),
  };
}

export type NativeToolTemplate = "rsi" | "atr" | "zscore" | "whale-signal" | "regime-classify" | "pit-validate" | "data-quality" | "strategy-mutate" | "portfolio-check";

export function generateNativeTool(request: ToolFactoryRequest, template?: NativeToolTemplate): GeneratedToolSpec {
  const slug = request.name.trim().toLowerCase().replace(/[^a-z0-9.]+/g, "-");
  const templateId = template ? `native.${template}` : `native.generated.${slug}`;
  const builtIn = BUILT_INS.find((x) => x.id === templateId);
  if (builtIn) return { ...builtIn, name: request.name, description: request.description, category: request.category, inputSchema: request.inputSchema, outputSchema: request.outputSchema, version: "1.0.0" };
  return { ...request, id: `native.generated.${slug}`, version: "0.1.0", implementation: "native", safety: { sandboxed: true, credentialsAllowed: false, walletAccess: false } };
}

export function executeGeneratedTool(name: string, input: unknown): unknown {
  switch (name) {
    case "native.market.snapshot": return nativeMarketSnapshot(input as Parameters<typeof nativeMarketSnapshot>[0]);
    case "native.technical.signal": return nativeTechnicalSignal((input as { bars: Parameters<typeof nativeTechnicalSignal>[0]; fast?: number; slow?: number }).bars, (input as { fast?: number }).fast, (input as { slow?: number }).slow);
    case "native.risk.check": return nativeRiskCheck(input as Parameters<typeof nativeRiskCheck>[0]);
    case "native.position.size": return nativePositionSize(input as Parameters<typeof nativePositionSize>[0]);
    case "native.strategy.score": return nativeStrategyScore(input as Parameters<typeof nativeStrategyScore>[0]);
    case "native.paper.order": return nativePaperOrder(input as Parameters<typeof nativePaperOrder>[0]);
    case "native.rsi": { const x = input as { closes: number[]; period?: number }; return { rsi: nativeRsi(x.closes, x.period) }; }
    case "native.atr": { const x = input as { bars: Parameters<typeof nativeAtr>[0]; period?: number }; return { atr: nativeAtr(x.bars, x.period) }; }
    case "native.zscore": { const x = input as { values: number[]; window?: number }; return { zscore: nativeZScore(x.values, x.window) }; }
    case "native.whale.signal": return nativeWhaleSignal(input as Parameters<typeof nativeWhaleSignal>[0]);
    case "native.regime.classify": return { regime: nativeRegimeClassify(input as Parameters<typeof nativeRegimeClassify>[0]) };
    case "native.pit.validate": return validatePointInTime(input as Parameters<typeof validatePointInTime>[0], (input as { asOfTs: number }).asOfTs);
    case "native.data.quality": return checkBarData((input as { bars: Parameters<typeof checkBarData>[0] }).bars);
    case "native.strategy.mutate": {
      const x = input as { strategy: Parameters<typeof mutateStrategy>[0]; seed: number; policy?: Parameters<typeof mutateStrategy>[2] };
      return { strategy: mutateStrategy(x.strategy, x.seed, x.policy) };
    }
    case "native.portfolio.check": {
      const x = input as { exposures: Parameters<typeof checkPortfolioLimits>[0]; equity: number; maxGrossPct?: number; maxNetPct?: number; maxSinglePct?: number };
      return checkPortfolioLimits(x.exposures, x.equity, x.maxGrossPct, x.maxNetPct, x.maxSinglePct);
    }
    case "native.backtest": {
      const x = input as { bars: Parameters<typeof nativeBacktest>[0]; signalProfile?: "trend" | "mean-reversion"; feeBps?: number; slippageBps?: number };
      const signalFn = x.signalProfile === "mean-reversion"
        ? (window: Parameters<typeof nativeBacktest>[0], _index: number) => {
            const closes = window.slice(-20).map((b) => b.close);
            const avg = closes.reduce((a, b) => a + b, 0) / Math.max(1, closes.length);
            const last = closes.at(-1) ?? avg;
            return last < avg * 0.99 ? "long" : last > avg * 1.01 ? "short" : "flat";
          }
        : (window: Parameters<typeof nativeBacktest>[0], _index: number) => {
            const fast = window.slice(-10).map((b) => b.close);
            const slow = window.slice(-30).map((b) => b.close);
            const f = fast.reduce((a, b) => a + b, 0) / Math.max(1, fast.length);
            const s = slow.reduce((a, b) => a + b, 0) / Math.max(1, slow.length);
            return f > s ? "long" : f < s ? "short" : "flat";
          };
      return nativeBacktest(x.bars, signalFn, x.feeBps, x.slippageBps);
    }
    default: throw new Error(`Generated tool not executable: ${name}`);
  }
}


export type NativeToolLifecycle = "proposed" | "tested" | "approved" | "deployed" | "retired";

export interface NativeToolRecord extends GeneratedToolSpec {
  lifecycle: NativeToolLifecycle;
  schemaHash: string;
  implementationHash: string;
  provenance: string;
  updatedAt: number;
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj).sort().map((k) => `${JSON.stringify(k)}:${stableJson(obj[k])}`).join(",")}}`;
}

// Pure-JS synchronous SHA-256 (no "node:crypto"). This module is reachable
// from client bundles (native-tool registration/fingerprinting is used by
// code that the browser also imports, via the global worker/org store), and
// Vite externalizes "node:crypto" there — merely importing it throws at
// module-evaluation time ("Cannot access ... in client code"), which was
// crashing hydration on every page. `crypto.subtle.digest` would be the
// natural fix, but it's async, and `nativeToolFingerprint`/`registerNativeTool`
// are called synchronously throughout this codebase's tests and callers, so
// swapping in a sync, dependency-free SHA-256 avoids a much larger async
// refactor for what is just a deterministic fingerprint, not a security
// boundary. Output format matches node's createHash("sha256").digest("hex").
const SHA256_K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];
const SHA256_H0 = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];

function rotr(x: number, n: number): number {
  return (x >>> n) | (x << (32 - n));
}

function sha256Hex(value: string): string {
  const bytes = new TextEncoder().encode(value);
  const bitLen = bytes.length * 8;
  const withOne = new Uint8Array(((bytes.length + 9 + 63) >> 6) << 6);
  withOne.set(bytes);
  withOne[bytes.length] = 0x80;
  const view = new DataView(withOne.buffer);
  // 64-bit big-endian length; message sizes here never approach 2^32 bits.
  view.setUint32(withOne.length - 4, bitLen >>> 0, false);
  view.setUint32(withOne.length - 8, Math.floor(bitLen / 0x100000000), false);

  const h = SHA256_H0.slice();
  const w = new Int32Array(64);
  for (let offset = 0; offset < withOne.length; offset += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(offset + i * 4, false);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
    }
    let [a, b, c, d, e, f, g, hh] = h;
    for (let i = 0; i < 64; i++) {
      const s1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (hh + s1 + ch + SHA256_K[i] + w[i]) | 0;
      const s0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (s0 + maj) | 0;
      hh = g; g = f; f = e; e = (d + t1) | 0;
      d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    h[0] = (h[0] + a) | 0; h[1] = (h[1] + b) | 0; h[2] = (h[2] + c) | 0; h[3] = (h[3] + d) | 0;
    h[4] = (h[4] + e) | 0; h[5] = (h[5] + f) | 0; h[6] = (h[6] + g) | 0; h[7] = (h[7] + hh) | 0;
  }
  return h.map((x) => (x >>> 0).toString(16).padStart(8, "0")).join("");
}

export function createNativeToolRegistry(): Map<string, NativeToolRecord> {
  return new Map();
}

export function registerNativeTool(registry: Map<string, NativeToolRecord>, tool: GeneratedToolSpec, provenance: string, implementationHash?: string): NativeToolRecord {
  if (!tool.id.startsWith("native.")) throw new Error("Native tool id must use the native.* namespace");
  if (!tool.safety.sandboxed || tool.safety.credentialsAllowed || tool.safety.walletAccess) {
    throw new Error("Native generated tools must remain sandboxed and credential/wallet free");
  }
  if (!provenance.trim()) throw new Error("Tool provenance is required");
  const fingerprint = nativeToolFingerprint(tool);
  const record: NativeToolRecord = {
    ...tool,
    lifecycle: "proposed",
    schemaHash: fingerprint.schemaHash,
    implementationHash: implementationHash ?? fingerprint.implementationHash,
    provenance,
    updatedAt: Date.now(),
  };
  registry.set(tool.id, record);
  return { ...record, inputSchema: { ...record.inputSchema }, outputSchema: { ...record.outputSchema }, safety: { ...record.safety } };
}

export function advanceNativeToolLifecycle(registry: Map<string, NativeToolRecord>, id: string, next: NativeToolLifecycle): NativeToolRecord {
  const current = registry.get(id);
  if (!current) throw new Error(`Unknown native tool: ${id}`);
  const order: NativeToolLifecycle[] = ["proposed", "tested", "approved", "deployed", "retired"];
  const ci = order.indexOf(current.lifecycle);
  const ni = order.indexOf(next);
  if (ni !== ci + 1 && !(current.lifecycle === "deployed" && next === "retired")) {
    throw new Error(`Invalid native tool lifecycle transition ${current.lifecycle} -> ${next}`);
  }
  const updated = { ...current, lifecycle: next, updatedAt: Date.now() };
  registry.set(id, updated);
  return updated;
}

export function executeRegisteredNativeTool(registry: Map<string, NativeToolRecord>, name: string, input: unknown): unknown {
  const record = registry.get(name);
  if (!record) throw new Error(`Native tool is not registered: ${name}`);
  if (record.lifecycle !== "deployed") throw new Error(`Native tool is not deployed: ${name}`);
  return executeGeneratedTool(name, input);
}


export interface NativeToolRegistryStore {
  upsert(record: NativeToolRecord): Promise<NativeToolRecord>;
  get(id: string): Promise<NativeToolRecord | null>;
  list(lifecycle?: NativeToolLifecycle): Promise<NativeToolRecord[]>;
}

export class InMemoryNativeToolRegistryStore implements NativeToolRegistryStore {
  private readonly registry: Map<string, NativeToolRecord>;
  constructor(registry: Map<string, NativeToolRecord> = createNativeToolRegistry()) { this.registry = registry; }
  async upsert(record: NativeToolRecord) { this.registry.set(record.id, { ...record }); return { ...record }; }
  async get(id: string) { const r = this.registry.get(id); return r ? { ...r } : null; }
  async list(lifecycle?: NativeToolLifecycle) {
    return [...this.registry.values()].filter((r) => lifecycle == null || r.lifecycle === lifecycle).map((r) => ({ ...r }));
  }
}

interface SqlLikeToolRegistry { query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>; }
function registryFromRow(row: Record<string, unknown>): NativeToolRecord {
  const decode = (v: unknown) => typeof v === 'string' ? JSON.parse(v) : v;
  return {
    id: String(row.tool_id),
    name: String(row.name),
    description: String(row.description),
    category: String(row.category) as ToolFactoryRequest['category'],
    inputSchema: decode(row.input_schema) as Record<string, string>,
    outputSchema: decode(row.output_schema) as Record<string, string>,
    version: String(row.version),
    implementation: 'native',
    safety: { sandboxed: Boolean(row.sandboxed), credentialsAllowed: Boolean(row.credentials_allowed), walletAccess: Boolean(row.wallet_access) },
    lifecycle: String(row.lifecycle) as NativeToolLifecycle,
    schemaHash: String(row.schema_hash),
    implementationHash: String(row.implementation_hash),
    provenance: String(row.provenance),
    updatedAt: new Date(String(row.updated_at)).getTime(),
  };
}

export class SqlNativeToolRegistryStore implements NativeToolRegistryStore {
  private sqlPromise: Promise<SqlLikeToolRegistry> | null = null;
  private sql(): Promise<SqlLikeToolRegistry> {
    this.sqlPromise ??= import('../../lib/db.ts').then(({ getSql }) => getSql());
    return this.sqlPromise;
  }
  async upsert(record: NativeToolRecord) {
    const sql = await this.sql();
    const rows = await sql.query<Record<string, unknown>>(`insert into trading_native_tool_registry\n      (tool_id,name,description,category,input_schema,output_schema,version,implementation,sandboxed,credentials_allowed,wallet_access,lifecycle,schema_hash,implementation_hash,provenance,updated_at)\n      values ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7,$8,$9,$10,$11,$12,$13,$14,$15,to_timestamp($16/1000.0))\n      on conflict (tool_id) do update set name=excluded.name,description=excluded.description,category=excluded.category,input_schema=excluded.input_schema,output_schema=excluded.output_schema,version=excluded.version,implementation=excluded.implementation,sandboxed=excluded.sandboxed,credentials_allowed=excluded.credentials_allowed,wallet_access=excluded.wallet_access,lifecycle=excluded.lifecycle,schema_hash=excluded.schema_hash,implementation_hash=excluded.implementation_hash,provenance=excluded.provenance,updated_at=excluded.updated_at returning *`,
      [record.id,record.name,record.description,record.category,JSON.stringify(record.inputSchema),JSON.stringify(record.outputSchema),record.version,record.implementation,record.safety.sandboxed,record.safety.credentialsAllowed,record.safety.walletAccess,record.lifecycle,record.schemaHash,record.implementationHash,record.provenance,record.updatedAt]);
    if (!rows[0]) throw new Error('native_tool_registry_upsert_failed');
    return registryFromRow(rows[0]);
  }
  async get(id: string) { const sql=await this.sql(); const rows=await sql.query<Record<string,unknown>>('select * from trading_native_tool_registry where tool_id=$1',[id]); return rows[0]?registryFromRow(rows[0]):null; }
  async list(lifecycle?: NativeToolLifecycle) { const sql=await this.sql(); const rows=await sql.query<Record<string,unknown>>(lifecycle ? 'select * from trading_native_tool_registry where lifecycle=$1 order by updated_at desc' : 'select * from trading_native_tool_registry order by updated_at desc', lifecycle ? [lifecycle] : []); return rows.map(registryFromRow); }
}

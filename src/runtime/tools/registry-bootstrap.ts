import { builtInTradingTools, createNativeToolRegistry, executeRegisteredNativeTool, nativeToolFingerprint, type GeneratedToolSpec, type NativeToolRecord, type NativeToolRegistryStore, registerNativeTool } from "./factory.ts";

export interface NativeToolReconciliationResult {
  registry: Map<string, NativeToolRecord>;
  seeded: string[];
  loaded: string[];
  deployed: string[];
  drifted: string[];
  blocked: string[];
}

export interface NativeToolReconciliationOptions {
  registry?: Map<string, NativeToolRecord>;
  store: NativeToolRegistryStore;
  builtIns?: GeneratedToolSpec[];
  seedMissingBuiltIns?: boolean;
  provenance?: string;
}

function safetyValid(tool: NativeToolRecord): boolean {
  return tool.implementation === "native"
    && tool.safety.sandboxed
    && !tool.safety.credentialsAllowed
    && !tool.safety.walletAccess;
}

function sameCode(record: NativeToolRecord, current: GeneratedToolSpec): boolean {
  const fingerprint = nativeToolFingerprint(current);
  return record.schemaHash === fingerprint.schemaHash && record.implementationHash === fingerprint.implementationHash;
}

/**
 * Rehydrate the durable native-tool registry after process restart.
 * Missing built-ins are seeded only as `proposed`; nothing is auto-approved/deployed.
 * Drifted or unsafe records are fail-closed and are not placed in the executable registry.
 */
export async function reconcileNativeToolRegistry(options: NativeToolReconciliationOptions): Promise<NativeToolReconciliationResult> {
  const registry = options.registry ?? createNativeToolRegistry();
  const builtIns = options.builtIns ?? builtInTradingTools();
  const builtInById = new Map(builtIns.map((tool) => [tool.id, tool]));
  const seeded: string[] = [];
  const loaded: string[] = [];
  const deployed: string[] = [];
  const drifted: string[] = [];
  const blocked: string[] = [];

  const durable = await options.store.list();
  const durableById = new Map(durable.map((record) => [record.id, record]));

  if (options.seedMissingBuiltIns !== false) {
    for (const tool of builtIns) {
      if (durableById.has(tool.id)) continue;
      const record = registerNativeTool(registry, tool, options.provenance?.trim() || "builtin:phase8.11");
      await options.store.upsert(record);
      durableById.set(record.id, record);
      seeded.push(record.id);
      registry.delete(record.id); // hydration below is the single source of loaded state
    }
  }

  for (const record of durableById.values()) {
    if (!safetyValid(record)) {
      blocked.push(record.id);
      continue;
    }
    const current = builtInById.get(record.id);
    if (current && !sameCode(record, current)) {
      drifted.push(record.id);
      continue;
    }
    registry.set(record.id, { ...record, inputSchema: { ...record.inputSchema }, outputSchema: { ...record.outputSchema }, safety: { ...record.safety } });
    loaded.push(record.id);
    if (record.lifecycle === "deployed") deployed.push(record.id);
  }

  return { registry, seeded, loaded: loaded.sort(), deployed: deployed.sort(), drifted: drifted.sort(), blocked: blocked.sort() };
}


export interface NativeToolRuntimeState {
  registry: Map<string, NativeToolRecord>;
  deployed: string[];
  blocked: string[];
  drifted: string[];
}

/**
 * Governed runtime facade used by the server worker activation path.
 * Reconciliation is required before execution; only durable records in the
 * `deployed` lifecycle can cross this boundary.
 */
export class GovernedNativeToolRuntime {
  private state: NativeToolRuntimeState | null = null;
  private readonly store: NativeToolRegistryStore;
  private readonly options: Omit<NativeToolReconciliationOptions, "store" | "registry">;

  constructor(
    store: NativeToolRegistryStore,
    options: Omit<NativeToolReconciliationOptions, "store" | "registry"> = {},
  ) {
    this.store = store;
    this.options = options;
  }

  async reconcile(): Promise<NativeToolRuntimeState> {
    const result = await reconcileNativeToolRegistry({ ...this.options, store: this.store });
    this.state = {
      registry: result.registry,
      deployed: result.deployed,
      blocked: result.blocked,
      drifted: result.drifted,
    };
    return this.state;
  }

  status(): NativeToolRuntimeState | null {
    return this.state;
  }

  execute(name: string, input: unknown): unknown {
    if (!this.state) throw new Error("native_tool_runtime_not_bootstrapped");
    if (!this.state.deployed.includes(name)) throw new Error(`native_tool_not_deployed:${name}`);
    return executeRegisteredNativeTool(this.state.registry, name, input);
  }
}

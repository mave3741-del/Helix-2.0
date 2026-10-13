import type { ServerTradingRuntime } from "@/trading/runtime/runtime";
import type { RiskLimits } from "@/runtime/tools/trading";

// Conservative defaults for a paper-only research runtime. These are a
// starting point, not a recommendation — tune capital/risk to whatever the
// actual paper-trading plan calls for before treating results as meaningful.
const DEFAULT_CAPITAL = 100_000;
const DEFAULT_RISK: RiskLimits = {
  capital: DEFAULT_CAPITAL,
  maxPositionPct: 0.1,
  maxOrderPct: 0.05,
  maxDailyLossPct: 0.03,
  maxDrawdownPct: 0.15,
  maxLeverage: 2,
};

let runtime: ServerTradingRuntime | null = null;
let recovered: Promise<void> | null = null;
let initPromise: Promise<ServerTradingRuntime> | null = null;

const AUTOSAVE_INTERVAL_MS = 60_000;

/**
 * The one server-side paper-trading runtime for this process. Built lazily
 * on first use with ServerTradingRuntime's own SQL-backed stores (journal,
 * market ticks, task queue, snapshots).
 *
 * State genuinely survives a server restart: on first access this restores
 * the last saved snapshot (if any) via recoverFromSnapshot(), and a
 * background timer calls persistSnapshot() every minute after that so a
 * crash or redeploy loses at most a minute of state, not the whole session.
 *
 * `@/trading/runtime/runtime` is dynamically (not statically) imported here
 * because this module is reachable from client code via the createServerFn
 * handlers that call getServerRuntime() (paper-desk-server.ts,
 * readiness-server.ts), and ServerTradingRuntime's own dependency tree
 * touches node:crypto/node:fs/pg directly. A static import would pull all of
 * that into the browser build, where Vite externalizes those Node builtins —
 * merely importing them throws at module-evaluation time and crashes
 * hydration. Same pattern already used in src/runtime/brain/server.ts.
 */
export async function getServerRuntime(): Promise<ServerTradingRuntime> {
  if (runtime) return runtime;
  if (!initPromise) {
    initPromise = (async () => {
      const { ServerTradingRuntime } = await import("@/trading/runtime/runtime");
      const instance = new ServerTradingRuntime({ capital: DEFAULT_CAPITAL, risk: DEFAULT_RISK });
      runtime = instance;
      recovered = instance
        .recoverFromSnapshot()
        .catch((err) => {
          // A missing/corrupt snapshot should never block startup — fresh
          // state is always a safe fallback, so this is logged, not thrown.
          console.error("[helix] runtime snapshot recovery failed, starting fresh:", err);
        })
        .then(() => undefined);
      setInterval(() => {
        instance.persistSnapshot().catch((err) => console.error("[helix] runtime snapshot autosave failed:", err));
      }, AUTOSAVE_INTERVAL_MS).unref();
      return instance;
    })();
  }
  return initPromise;
}

/** Resolves once the initial snapshot-recovery attempt (success or handled failure) has finished. */
export async function runtimeRecovered(): Promise<void> {
  await getServerRuntime();
  return recovered ?? Promise.resolve();
}

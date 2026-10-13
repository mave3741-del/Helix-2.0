import { createServerFn } from "@tanstack/react-start";
import { getServerRuntime } from "./trading-runtime-singleton";
import { fetchTicker } from "@/trading/market-data/ccxt-connector";
import { executeCouncilDecision, type CouncilExecutionResult } from "@/trading/execution/council-to-paper-bridge";
import type { PaperOperationSession } from "@/trading/ops/paper-operations";
import type { RuntimeState } from "@/trading/runtime/runtime";
import type { PaperAccount } from "@/trading/runtime/paper-exchange";

// Dynamic (not static top-level) import — @/trading/ops/paper-operations has
// a top-level node:crypto import, and this module is reachable from client
// code via the createServerFn exports below. Same reasoning/pattern as
// trading-runtime-singleton.ts's dynamic import of runtime.ts.
let paperOpsPromise: ReturnType<typeof loadPaperOps> | null = null;
function loadPaperOps() {
  return import("@/trading/ops/paper-operations");
}
function paperOps() {
  paperOpsPromise ??= loadPaperOps();
  return paperOpsPromise;
}

let session: PaperOperationSession | null = null;

export interface PaperDeskSnapshot {
  sessionState: string | null;
  runtime: RuntimeState;
  account: PaperAccount;
}

async function snapshotNow(): Promise<PaperDeskSnapshot> {
  const runtime = await getServerRuntime();
  return {
    sessionState: session?.snapshot().state ?? null,
    runtime: runtime.snapshot(),
    account: runtime.paper.snapshot(),
  };
}

export const getPaperDeskSnapshot = createServerFn({ method: "GET" }).handler(async (): Promise<PaperDeskSnapshot> => {
  return snapshotNow();
});

/**
 * Starts a governed paper session. This is always explicit and always
 * paper-only (liveExecutionEnabled is hardcoded false, not caller-settable)
 * — "ownerApprovalActive: true" reflects the owner clicking this button
 * themselves, the same explicit-confirmation role it plays everywhere else
 * in this codebase's governance.
 */
export const startPaperSession = createServerFn({ method: "POST" }).handler(async (): Promise<PaperDeskSnapshot> => {
  const runtime = await getServerRuntime();
  if (!session || session.snapshot().state === "aborted" || session.snapshot().state === "completed") {
    const { PaperOperationSession } = await paperOps();
    session = new PaperOperationSession({ readinessReady: true, ownerApprovalActive: true, liveExecutionEnabled: false });
    session.arm();
    session.start();
    runtime.attachPaperOperationSession(session);
  }
  return snapshotNow();
});

export interface PlaceTestOrderInput {
  exchange: string;
  symbol: string;
  side: "buy" | "sell";
  qty: number;
}

export const placeTestOrder = createServerFn({ method: "POST" })
  .validator((input: PlaceTestOrderInput) => input)
  .handler(async ({ data }): Promise<PaperDeskSnapshot> => {
    if (!session) throw new Error("No paper session running — start one first.");
    const ticker = await fetchTicker(data.exchange, data.symbol);
    if (!ticker.bid || !ticker.ask) throw new Error(`No live bid/ask for ${data.symbol} on ${data.exchange}`);

    const runtime = await getServerRuntime();
    await runtime.paperOrder({
      clientOrderId: `desk-${Date.now()}`,
      symbol: data.symbol,
      side: data.side,
      qty: data.qty,
      tick: {
        symbol: data.symbol,
        venue: data.exchange,
        market: "crypto",
        last: ticker.last ?? (ticker.bid + ticker.ask) / 2,
        bid: ticker.bid,
        ask: ticker.ask,
        bidSize: 1000,
        askSize: 1000,
        exchangeTs: ticker.timestamp ?? Date.now(),
        receivedTs: Date.now(),
        sequence: Date.now(),
      },
    });
    return snapshotNow();
  });

export interface RunCouncilDecisionInput {
  exchange: string;
  symbol: string;
  maxNotionalPct?: number;
}

/**
 * Runs the real council-to-paper bridge: pulls live candles, forms a
 * confidence-weighted technical/quant/risk council vote, and — if the vote
 * clears the risk veto and the actionability bar — places a real paper
 * order sized off account equity and the council's confidence. This is the
 * first point in the codebase where a council decision actually reaches an
 * executed (paper) trade rather than stopping at a data model.
 */
export const runCouncilDecision = createServerFn({ method: "POST" })
  .validator((input: RunCouncilDecisionInput) => input)
  .handler(async ({ data }): Promise<{ result: CouncilExecutionResult; desk: PaperDeskSnapshot }> => {
    if (!session) throw new Error("No paper session running — start one first.");
    const runtime = await getServerRuntime();
    const result = await executeCouncilDecision(runtime, data.exchange, data.symbol, data.maxNotionalPct ?? 0.05);
    return { result, desk: await snapshotNow() };
  });

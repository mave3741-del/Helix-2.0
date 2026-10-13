// True cross-process persistence check. Run twice, as two separate OS
// processes (not two objects in one process — that would only prove the
// in-memory globalRef sharing, not real disk persistence):
//   node ... verify-runtime-persistence.mjs write
//   node ... verify-runtime-persistence.mjs read
import { ServerTradingRuntime } from "/home/claude/helix/src/trading/runtime/runtime.ts";
import { PaperOperationSession } from "/home/claude/helix/src/trading/ops/paper-operations.ts";

const RISK = { capital: 100_000, maxPositionPct: 0.5, maxOrderPct: 0.5, maxDailyLossPct: 0.5, maxDrawdownPct: 0.5, maxLeverage: 5 };
const mode = process.argv[2];

if (mode === "write") {
  const r = new ServerTradingRuntime({ capital: 100_000, risk: RISK });
  await r.recoverFromSnapshot();
  const session = new PaperOperationSession({ readinessReady: true, ownerApprovalActive: true, liveExecutionEnabled: false });
  session.arm(); session.start();
  r.attachPaperOperationSession(session);
  await r.paperOrder({
    clientOrderId: `verify-${Date.now()}`, symbol: "BTC", side: "buy", qty: 3,
    tick: { symbol: "BTC", venue: "paper", market: "crypto", last: 200, bid: 199, ask: 201, bidSize: 100, askSize: 100, exchangeTs: Date.now(), receivedTs: Date.now(), sequence: 1 },
  });
  const pos = r.paper.snapshot().positions.BTC;
  await r.persistSnapshot();
  console.log("[write process] saved position:", JSON.stringify(pos));
} else if (mode === "read") {
  const r = new ServerTradingRuntime({ capital: 100_000, risk: RISK });
  const recovered = await r.recoverFromSnapshot();
  const pos = r.paper.snapshot().positions.BTC;
  console.log("[read process] recovered:", recovered, "position:", JSON.stringify(pos));
  const ok = recovered === true && pos?.qty === 3;
  console.log(ok ? "PASS: a genuinely separate OS process recovered the position from disk." : "FAIL");
  process.exit(ok ? 0 : 1);
} else {
  console.error("usage: node verify-runtime-persistence.mjs write|read");
  process.exit(1);
}

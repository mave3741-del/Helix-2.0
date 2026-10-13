import assert from "node:assert/strict";
import test from "node:test";
import { AlpacaPaperConnector, type BrokerConnector } from "./broker-connectors.ts";
import { AgentTradeGateway } from "./agent-trade-gateway.ts";

function response(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" }, ...init });
}

test("alpaca paper connector uses paper endpoint and maps account/markets/order", async () => {
  const calls: Array<{ url: string; method: string; body?: string }> = [];
  let orderCounter = 0;
  const fetcher: typeof fetch = async (input, init) => {
    const url = String(input);
    calls.push({ url, method: init?.method ?? "GET", body: init?.body as string | undefined });
    if (url.endsWith("/account")) return response({ id: "acct", currency: "USD", status: "ACTIVE", buying_power: "100000", cash: "100000", portfolio_value: "100000", equity: "100000" });
    if (url.includes("/assets?")) return response([{ symbol: "BTC/USD", class: "crypto", tradable: true, fractionable: true, status: "active" }]);
    if (url.endsWith("/positions")) return response([{ symbol: "BTC/USD", qty: "0.1", avg_entry_price: "100000", market_value: "10100", unrealized_pl: "100" }]);
    if (url.includes("/orders?") && (init?.method ?? "GET") === "GET") return response([{ id: "o1", client_order_id: "c1", symbol: "BTC/USD", side: "buy", type: "market", qty: "0.1", filled_qty: "0.1", filled_avg_price: "101000", status: "filled" }]);
    if (url.endsWith("/orders") && init?.method === "POST") {
      orderCounter += 1;
      const body = JSON.parse(String(init.body));
      return response({ id: `o${orderCounter + 1}`, client_order_id: body.client_order_id, symbol: body.symbol, side: body.side, type: body.type, qty: body.qty ?? body.notional, filled_qty: "0", status: "new" });
    }
    if (init?.method === "DELETE") return new Response(null, { status: 204 });
    throw new Error(`unexpected:${url}`);
  };

  const connector = new AlpacaPaperConnector({ key: "k", secret: "s", fetcher });
  assert.equal((await connector.account()).buyingPower, 100000);
  assert.equal((await connector.markets({ assetClass: "crypto" }))[0].symbol, "BTC/USD");
  assert.equal((await connector.positions())[0].qty, 0.1);
  assert.equal((await connector.orders())[0].status, "filled");
  const order = await connector.placeOrder({ clientOrderId: "agent-1", symbol: "BTC/USD", side: "buy", qty: 0.001 });
  assert.equal(order.status, "new");
  await connector.cancelOrder(order.id);
  assert.ok(calls.every((call) => call.url.startsWith("https://paper-api.alpaca.markets/v2")));
});

test("agent gateway blocks an unapproved trade before the broker", async () => {
  let called = false;
  const connector: BrokerConnector = {
    id: "test", mode: "paper",
    async account() { return { id: "a", currency: "USD", status: "ACTIVE", buyingPower: 100, cash: 100, portfolioValue: 100, equity: 100 }; },
    async markets() { return []; }, async positions() { return []; }, async orders() { return []; },
    async placeOrder() { called = true; throw new Error("must_not_call"); }, async cancelOrder() {},
  };
  const gateway = new AgentTradeGateway(connector);
  const result = await gateway.place({ workerId: "w1", taskId: "t1", clientOrderId: "c1", symbol: "BTC/USD", side: "buy", qty: 1, approved: false, riskApproved: false, ownerApproved: false, paperSessionId: "" });
  assert.equal(result.accepted, false);
  assert.equal(result.reason, "risk_approval_required");
  assert.equal(called, false);
});

test("gateway rejects live connectors even when all approval flags are true", async () => {
  const connector: BrokerConnector = {
    id: "test-live", mode: "live",
    async account() { throw new Error("not_expected"); }, async markets() { return []; }, async positions() { return []; }, async orders() { return []; },
    async placeOrder() { throw new Error("must_not_call"); }, async cancelOrder() {},
  };
  const gateway = new AgentTradeGateway(connector);
  const result = await gateway.place({ workerId: "w1", taskId: "t1", clientOrderId: "c1", symbol: "BTC/USD", side: "buy", qty: 1, approved: true, riskApproved: true, ownerApproved: true, paperSessionId: "s1" });
  assert.equal(result.accepted, false);
  assert.equal(result.reason, "live_connector_forbidden");
});

test("worker trading path can route only an explicitly risk-approved intent", async () => {
  const calls: string[] = [];
  const connector: BrokerConnector = {
    id: "test-paper", mode: "paper",
    async account() { return { id: "a", currency: "USD", status: "ACTIVE", buyingPower: 1000, cash: 1000, portfolioValue: 1000, equity: 1000 }; },
    async markets() { return [{ symbol: "BTC/USD", assetClass: "crypto", tradable: true }]; },
    async positions() { return []; }, async orders() { return []; },
    async placeOrder(order) { calls.push(`${order.side}:${order.symbol}`); return { id: "o1", clientOrderId: order.clientOrderId, symbol: order.symbol, side: order.side, type: order.type ?? "market", qty: order.qty ?? 0, filledQty: 0, status: "new" }; },
    async cancelOrder() {},
  };
  const gateway = new AgentTradeGateway(connector);
  const engineModule = await import("../runtime/worker-execution.ts");
  const evidence = { async get() { return null; } } as never;
  const debates = { } as never;
  const engine = new engineModule.TradingWorkerTaskEngine({ evidence, debates, tradeGateway: gateway });
  const worker = { workerId: "w-trader", family: "execution", specializationName: "Execution Agent", capabilities: ["trading"] } as never;
  const base = { id: "trade-task", type: "trade.execute", payload: { symbol: "BTC/USD", side: "buy", qty: 0.001, riskApproved: true, ownerApproved: true, paperSessionId: "paper-session-1" }, status: "running", priority: 1, availableAt: Date.now(), attempts: 1, maxAttempts: 1, workerId: "w-trader", leaseUntil: Date.now()+1000, heartbeatAt: Date.now(), lastError: null, createdAt: Date.now(), updatedAt: Date.now(), completedAt: null } as never;
  const result = await engine.execute({ task: base, worker });
  assert.equal(result.ok, true);
  assert.deepEqual(calls, ["buy:BTC/USD"]);
});

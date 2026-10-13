import type { BrokerConnector, BrokerOrder, BrokerOrderRequest } from "./broker-connectors.ts";

export interface AgentTradeRequest extends BrokerOrderRequest {
  workerId: string;
  taskId: string;
  approved: boolean;
  riskApproved: boolean;
  ownerApproved: boolean;
  paperSessionId: string;
  evidenceIds?: string[];
  strategyId?: string;
}

export interface AgentTradeResult {
  accepted: boolean;
  order?: BrokerOrder;
  reason?: string;
}

/**
 * Final broker gateway between an agent decision and an exchange/broker.
 * Agent code cannot bypass the explicit approval/risk envelope passed here.
 */
export class AgentTradeGateway {
  private readonly connector: BrokerConnector;
  constructor(connector: BrokerConnector) { this.connector = connector; }

  async place(request: AgentTradeRequest): Promise<AgentTradeResult> {
    if (this.connector.mode !== "paper") return { accepted: false, reason: "live_connector_forbidden" };
    if (request.riskApproved !== true) return { accepted: false, reason: "risk_approval_required" };
    if (request.ownerApproved !== true) return { accepted: false, reason: "owner_approval_required" };
    if (request.approved !== true) return { accepted: false, reason: "agent_trade_not_approved" };
    if (!request.paperSessionId.trim()) return { accepted: false, reason: "paper_session_id_required" };
    if (!request.workerId.trim() || !request.taskId.trim()) return { accepted: false, reason: "worker_and_task_identity_required" };
    const order = await this.connector.placeOrder(request);
    return { accepted: true, order };
  }

  account() { return this.connector.account(); }
  markets(query?: Parameters<BrokerConnector["markets"]>[0]) { return this.connector.markets(query); }
  positions() { return this.connector.positions(); }
  orders(options?: Parameters<BrokerConnector["orders"]>[0]) { return this.connector.orders(options); }
  cancel(orderId: string) { return this.connector.cancelOrder(orderId); }
}

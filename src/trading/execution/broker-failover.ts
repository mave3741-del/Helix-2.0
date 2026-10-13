import type { BrokerConnector, BrokerOrder, BrokerOrderRequest } from './broker-connectors.ts';

export interface BrokerHealth {
  connectorId: string;
  healthy: boolean;
  consecutiveFailures: number;
  lastSuccessAt: number | null;
  lastFailureAt: number | null;
  reason: string | null;
}

export interface BrokerFailoverResult<T> {
  connectorId: string;
  value: T;
}

export class BrokerFailoverRouter {
  private readonly health = new Map<string, BrokerHealth>();
  private readonly connectors: BrokerConnector[];
  private readonly failureThreshold: number;
  private readonly orderOwners = new Map<string, string>();

  constructor(connectors: BrokerConnector[], options: { failureThreshold?: number } = {}) {
    if (!connectors.length) throw new Error('broker_failover_requires_connector');
    const live = connectors.filter((connector) => connector.mode === 'live');
    if (live.length) throw new Error('live_connector_disabled');
    this.connectors = [...connectors];
    this.failureThreshold = Math.max(1, options.failureThreshold ?? 2);
    for (const connector of connectors) this.health.set(connector.id, { connectorId: connector.id, healthy: true, consecutiveFailures: 0, lastSuccessAt: null, lastFailureAt: null, reason: null });
  }

  status(): BrokerHealth[] {
    return this.connectors.map((connector) => ({ ...this.health.get(connector.id)! }));
  }

  private markSuccess(id: string): void {
    const current = this.health.get(id)!;
    this.health.set(id, { ...current, healthy: true, consecutiveFailures: 0, lastSuccessAt: Date.now(), reason: null });
  }

  private markFailure(id: string, error: unknown): void {
    const current = this.health.get(id)!;
    const failures = current.consecutiveFailures + 1;
    this.health.set(id, { ...current, healthy: failures < this.failureThreshold, consecutiveFailures: failures, lastFailureAt: Date.now(), reason: error instanceof Error ? error.message : String(error) });
  }

  private ordered(): BrokerConnector[] {
    return [...this.connectors].sort((a, b) => Number(this.health.get(a.id)!.healthy === false) - Number(this.health.get(b.id)!.healthy === false));
  }

  private async executeRead<T>(operation: (connector: BrokerConnector) => Promise<T>): Promise<BrokerFailoverResult<T>> {
    let lastError: unknown;
    for (const connector of this.ordered()) {
      if (!this.health.get(connector.id)!.healthy) continue;
      try {
        const value = await operation(connector);
        this.markSuccess(connector.id);
        return { connectorId: connector.id, value };
      } catch (error) {
        this.markFailure(connector.id, error);
        lastError = error;
      }
    }
    throw new Error(`broker_failover_exhausted:${lastError instanceof Error ? lastError.message : String(lastError)}`);
  }

  private rememberOrder(connectorId: string, order: BrokerOrder): BrokerOrder {
    if (order.clientOrderId?.trim()) this.orderOwners.set(`client:${order.clientOrderId}`, connectorId);
    if (order.id?.trim()) this.orderOwners.set(`id:${order.id}`, connectorId);
    return order;
  }

  private async findOrderByClientOrderId(clientOrderId: string, symbol?: string): Promise<BrokerFailoverResult<BrokerOrder> | null> {
    for (const connector of this.connectors) {
      try {
        const rows = await connector.orders({ status: 'all', limit: 500, ...(symbol ? { symbol } : {}) });
        const found = rows.find((row) => row.clientOrderId === clientOrderId);
        if (found) {
          this.markSuccess(connector.id);
          return { connectorId: connector.id, value: this.rememberOrder(connector.id, found) };
        }
      } catch (error) {
        this.markFailure(connector.id, error);
      }
    }
    return null;
  }

  private async findOrderOwner(orderId: string): Promise<{ connector: BrokerConnector; order: BrokerOrder } | null> {
    const known = this.orderOwners.get(`id:${orderId}`);
    if (known) {
      const connector = this.connectors.find((candidate) => candidate.id === known);
      if (connector) return { connector, order: { id: orderId, clientOrderId: '', symbol: '', side: 'buy', type: 'market', qty: 0, filledQty: 0, status: 'unknown' } };
    }
    for (const connector of this.connectors) {
      try {
        const rows = await connector.orders({ status: 'all', limit: 500 });
        const found = rows.find((row) => row.id === orderId);
        if (found) {
          this.markSuccess(connector.id);
          this.rememberOrder(connector.id, found);
          return { connector, order: found };
        }
      } catch (error) {
        this.markFailure(connector.id, error);
      }
    }
    return null;
  }

  async account(): Promise<BrokerFailoverResult<Awaited<ReturnType<BrokerConnector['account']>>>> { return this.executeRead((c) => c.account()); }
  async positions(): Promise<BrokerFailoverResult<Awaited<ReturnType<BrokerConnector['positions']>>>> { return this.executeRead((c) => c.positions()); }
  async orders(options?: { status?: string; limit?: number; symbol?: string }): Promise<BrokerFailoverResult<BrokerOrder[]>> { return this.executeRead((c) => c.orders(options)); }

  /**
   * Order submission is intentionally NOT failover-safe after the first POST.
   * A timeout can occur after a broker accepts an order; submitting the same
   * intent to a second broker could create a duplicate position. We reconcile
   * the idempotency key first and after any submission error, then fail closed
   * instead of silently switching brokers.
   */
  async placeOrder(order: BrokerOrderRequest): Promise<BrokerFailoverResult<BrokerOrder>> {
    if (!order.clientOrderId.trim()) throw new Error('client_order_id_required');
    const existing = await this.findOrderByClientOrderId(order.clientOrderId, order.symbol);
    if (existing) return existing;

    const connector = this.ordered().find((candidate) => this.health.get(candidate.id)!.healthy);
    if (!connector) throw new Error('broker_order_submission_no_healthy_connector');

    try {
      const value = await connector.placeOrder(order);
      this.markSuccess(connector.id);
      return { connectorId: connector.id, value: this.rememberOrder(connector.id, value) };
    } catch (error) {
      this.markFailure(connector.id, error);
      const reconciled = await this.findOrderByClientOrderId(order.clientOrderId, order.symbol);
      if (reconciled) return reconciled;
      throw new Error(`broker_order_submission_indeterminate:${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /** Cancel is owner-routed, never blindly failed over to another broker. */
  async cancelOrder(orderId: string): Promise<BrokerFailoverResult<void>> {
    const owner = await this.findOrderOwner(orderId);
    if (!owner) throw new Error('broker_order_owner_unknown');
    try {
      await owner.connector.cancelOrder(orderId);
      this.markSuccess(owner.connector.id);
      return { connectorId: owner.connector.id, value: undefined };
    } catch (error) {
      this.markFailure(owner.connector.id, error);
      throw new Error(`broker_cancel_indeterminate:${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

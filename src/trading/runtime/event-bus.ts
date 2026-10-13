export interface TradingEvent<T = unknown> {
  id: string;
  type: string;
  ts: number;
  source: string;
  payload: T;
}

type Handler<T> = (event: TradingEvent<T>) => void | Promise<void>;

export class TradingEventBus {
  private readonly handlers = new Map<string, Set<Handler<unknown>>>();
  private readonly seen = new Set<string>();

  subscribe<T>(type: string, handler: Handler<T>): () => void {
    const bucket = this.handlers.get(type) ?? new Set<Handler<unknown>>();
    bucket.add(handler as Handler<unknown>);
    this.handlers.set(type, bucket);
    return () => bucket.delete(handler as Handler<unknown>);
  }

  async publish<T>(event: TradingEvent<T>): Promise<boolean> {
    if (this.seen.has(event.id)) return false;
    this.seen.add(event.id);
    const handlers = [...(this.handlers.get(event.type) ?? [])];
    await Promise.all(handlers.map((handler) => handler(event)));
    return true;
  }

  clearSeen(): void {
    this.seen.clear();
  }
}

export function createTradingEvent<T>(
  type: string,
  source: string,
  payload: T,
  ts = Date.now(),
  id?: string,
): TradingEvent<T> {
  return {
    id: id ?? `${source}:${type}:${ts}:${Math.random().toString(36).slice(2, 10)}`,
    type, ts, source, payload,
  };
}

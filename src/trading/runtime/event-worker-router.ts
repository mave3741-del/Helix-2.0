import type { TradingEvent } from './event-bus.ts';
import { taskFromTradingEvent, type TaskQueue, type TradingTask } from './task-queue.ts';

export interface EventWorkerRouterOptions {
  eventTypes?: string[];
  priorityByType?: Record<string, number>;
  maxAttempts?: number;
}

export interface RoutedEventResult {
  eventId: string;
  routed: boolean;
  task: TradingTask | null;
  reason?: 'ignored' | 'duplicate';
}

const DEFAULT_EVENT_TYPES = [
  'news.market-moving',
  'news.event',
  'macro.release',
  'macro.event',
  'risk.alert',
  'strategy.signal',
  'strategy.review',
  'market.regime.changed',
  'paper.order.filled',
];

const DEFAULT_PRIORITIES: Record<string, number> = {
  'risk.alert': 1000,
  'news.market-moving': 800,
  'macro.release': 700,
  'macro.event': 700,
  'market.regime.changed': 650,
  'strategy.signal': 600,
  'strategy.review': 550,
  'news.event': 500,
  'paper.order.filled': 400,
};

function clone<T>(value: T): T { return structuredClone(value); }

/**
 * Bridges selected durable runtime events into the worker task queue.
 * Raw market ticks are intentionally excluded from the default allowlist so
 * the low-latency path cannot be flooded by strategic worker work.
 */
export class TradingEventWorkerRouter {
  private readonly queue: TaskQueue;
  private readonly eventTypes: Set<string>;
  private readonly priorities: Record<string, number>;
  private readonly maxAttempts: number;
  private readonly unsubscribeFns: Array<() => void> = [];
  private readonly seen = new Map<string, RoutedEventResult>();

  constructor(input: { events: { subscribe<T>(type: string, handler: (event: TradingEvent<T>) => void | Promise<void>): () => void }; queue: TaskQueue; options?: EventWorkerRouterOptions }) {
    this.queue = input.queue;
    this.eventTypes = new Set(input.options?.eventTypes ?? DEFAULT_EVENT_TYPES);
    this.priorities = { ...DEFAULT_PRIORITIES, ...(input.options?.priorityByType ?? {}) };
    this.maxAttempts = Math.max(1, Math.min(100, Math.floor(input.options?.maxAttempts ?? 5)));
    for (const eventType of this.eventTypes) {
      this.unsubscribeFns.push(input.events.subscribe(eventType, (event) => { void this.route(event); }));
    }
  }

  allowlistedEventTypes(): string[] { return [...this.eventTypes].sort(); }

  async route<T>(event: TradingEvent<T>): Promise<RoutedEventResult> {
    const existing = this.seen.get(event.id);
    if (existing) return clone({ ...existing, task: existing.task ? clone(existing.task) : null, reason: 'duplicate' as const });
    if (!this.eventTypes.has(event.type)) {
      const ignored: RoutedEventResult = { eventId: event.id, routed: false, task: null, reason: 'ignored' };
      this.seen.set(event.id, ignored);
      return clone(ignored);
    }

    const taskInput = taskFromTradingEvent(event, {
      id: `event-task:${event.id}`,
      priority: this.priorities[event.type] ?? 0,
      maxAttempts: this.maxAttempts,
    });
    const enqueued = await this.queue.enqueue(taskInput);
    const result: RoutedEventResult = {
      eventId: event.id,
      routed: enqueued.inserted,
      task: clone(enqueued.task),
      reason: enqueued.inserted ? undefined : 'duplicate',
    };
    this.seen.set(event.id, result);
    return clone(result);
  }

  close(): void {
    for (const unsubscribe of this.unsubscribeFns.splice(0)) unsubscribe();
  }
}

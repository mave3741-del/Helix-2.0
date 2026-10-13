export interface PaperTradeAttribution {
  tradeId: string;
  strategyId: string;
  symbol: string;
  side: 'buy' | 'sell';
  qty: number;
  entryPrice: number;
  entryBenchmarkPrice: number;
  exitPrice: number;
  exitBenchmarkPrice: number;
  grossPnl: number;
  fees: number;
  slippageCost: number;
  netPnl: number;
  holdingMs: number;
  regime?: string;
  evidenceIds: string[];
  createdAt: number;
  decision?: import('./post-trade-feedback.ts').TradeDecisionFeedbackContext;
}

export interface StrategyPerformanceSnapshot {
  snapshotId: string;
  strategyId: string;
  asOfTs: number;
  tradeCount: number;
  wins: number;
  losses: number;
  netPnl: number;
  grossPnl: number;
  fees: number;
  slippageCost: number;
  winRate: number;
  avgTradePnl: number;
  maxDrawdown: number;
  profitFactor: number;
  expectancy: number;
  byRegime: Record<string, { trades: number; netPnl: number; winRate: number }>;
  attributionHash: string;
}

async function hash(input: unknown): Promise<string> {
  const data = new TextEncoder().encode(JSON.stringify(input));
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

export async function buildPerformanceSnapshot(strategyId: string, trades: PaperTradeAttribution[], asOfTs = Date.now()): Promise<StrategyPerformanceSnapshot> {
  const relevant = trades.filter((trade) => trade.strategyId === strategyId && trade.createdAt <= asOfTs).sort((a,b) => a.createdAt - b.createdAt);
  let equity = 0, peak = 0, maxDrawdown = 0;
  for (const trade of relevant) { equity += trade.netPnl; peak = Math.max(peak, equity); maxDrawdown = Math.max(maxDrawdown, peak - equity); }
  const wins = relevant.filter((t) => t.netPnl > 0).length;
  const losses = relevant.filter((t) => t.netPnl < 0).length;
  const grossPnl = relevant.reduce((s,t) => s + t.grossPnl, 0);
  const netPnl = relevant.reduce((s,t) => s + t.netPnl, 0);
  const fees = relevant.reduce((s,t) => s + t.fees, 0);
  const slippageCost = relevant.reduce((s,t) => s + t.slippageCost, 0);
  const positive = relevant.filter((t) => t.netPnl > 0).reduce((s,t) => s + t.netPnl, 0);
  const negative = -relevant.filter((t) => t.netPnl < 0).reduce((s,t) => s + t.netPnl, 0);
  const byRegime: StrategyPerformanceSnapshot['byRegime'] = {};
  for (const trade of relevant) {
    const key = trade.regime ?? 'unknown';
    const bucket = byRegime[key] ??= { trades: 0, netPnl: 0, winRate: 0 };
    bucket.trades += 1; bucket.netPnl += trade.netPnl;
  }
    for (const [key] of Object.entries(byRegime)) {
    const bucketTrades = relevant.filter((t) => (t.regime ?? 'unknown') === key);
    byRegime[key].winRate = bucketTrades.length ? bucketTrades.filter((t) => t.netPnl > 0).length / bucketTrades.length : 0;
  }
  const snapshotBase = { strategyId, asOfTs, tradeCount: relevant.length, wins, losses, netPnl, grossPnl, fees, slippageCost, winRate: relevant.length ? wins / relevant.length : 0, avgTradePnl: relevant.length ? netPnl / relevant.length : 0, maxDrawdown, profitFactor: negative > 0 ? positive / negative : positive > 0 ? Infinity : 0, expectancy: relevant.length ? netPnl / relevant.length : 0, byRegime };
  const attributionHash = await hash(snapshotBase);
  return { ...snapshotBase, snapshotId: `perf:${strategyId}:${asOfTs}:${attributionHash.slice(0, 24)}`, attributionHash };
}

export function attributePaperTrade(input: Omit<PaperTradeAttribution, 'netPnl' | 'createdAt'> & { createdAt?: number }): PaperTradeAttribution {
  const netPnl = input.grossPnl - input.fees - input.slippageCost;
  return { ...input, netPnl, createdAt: input.createdAt ?? Date.now() };
}


export interface StrategyPerformanceStore {
  save(snapshot: StrategyPerformanceSnapshot): Promise<void>;
  latest(strategyId: string): Promise<StrategyPerformanceSnapshot | null>;
}

export class InMemoryStrategyPerformanceStore implements StrategyPerformanceStore {
  private readonly items = new Map<string, StrategyPerformanceSnapshot>();
  async save(snapshot: StrategyPerformanceSnapshot) { this.items.set(snapshot.snapshotId, structuredClone(snapshot)); }
  async latest(strategyId: string) {
    const values = [...this.items.values()].filter((item) => item.strategyId === strategyId).sort((a,b) => b.asOfTs - a.asOfTs);
    return values[0] ? structuredClone(values[0]) : null;
  }
}

interface SqlLike { query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>; }

export class SqlStrategyPerformanceStore implements StrategyPerformanceStore {
  private sqlPromise: Promise<SqlLike> | null = null;
  private sql(): Promise<SqlLike> {
    this.sqlPromise ??= import('../lib/db.ts').then(({ getSql }) => getSql());
    return this.sqlPromise;
  }
  async save(snapshot: StrategyPerformanceSnapshot) {
    const sql = await this.sql();
    await sql.query(
      `insert into trading_strategy_performance_snapshots
       (snapshot_id, strategy_id, as_of_ts, trade_count, wins, losses, net_pnl, max_drawdown, profit_factor, win_rate, expectancy, by_regime, attribution_hash, gross_pnl, fees, slippage_cost, updated_at)
       values ($1,$2,to_timestamp($3/1000.0),$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13,$14,$15,$16,now())
       on conflict (snapshot_id) do update set trade_count=excluded.trade_count, wins=excluded.wins, losses=excluded.losses, net_pnl=excluded.net_pnl, max_drawdown=excluded.max_drawdown, profit_factor=excluded.profit_factor, win_rate=excluded.win_rate, expectancy=excluded.expectancy, by_regime=excluded.by_regime, attribution_hash=excluded.attribution_hash, gross_pnl=excluded.gross_pnl, fees=excluded.fees, slippage_cost=excluded.slippage_cost, updated_at=now()`,
      [snapshot.snapshotId, snapshot.strategyId, snapshot.asOfTs, snapshot.tradeCount, snapshot.wins, snapshot.losses, snapshot.netPnl, snapshot.maxDrawdown, snapshot.profitFactor, snapshot.winRate, snapshot.expectancy, JSON.stringify(snapshot.byRegime), snapshot.attributionHash, snapshot.grossPnl, snapshot.fees, snapshot.slippageCost],
    );
  }
  async latest(strategyId: string) {
    const sql = await this.sql();
    const rows = await sql.query<Record<string, unknown>>(
      `select snapshot_id, strategy_id, extract(epoch from as_of_ts)*1000 as as_of_ms, trade_count, wins, losses, net_pnl, gross_pnl, fees, slippage_cost, max_drawdown, profit_factor, win_rate, expectancy, by_regime, attribution_hash
       from trading_strategy_performance_snapshots where strategy_id=$1 order by as_of_ts desc limit 1`, [strategyId],
    );
    const row = rows[0];
    if (!row) return null;
    return {
      snapshotId: String(row.snapshot_id), strategyId: String(row.strategy_id), asOfTs: Number(row.as_of_ms), tradeCount: Number(row.trade_count),
      wins: Number(row.wins ?? 0), losses: Number(row.losses ?? 0),
      netPnl: Number(row.net_pnl), grossPnl: Number(row.gross_pnl), fees: Number(row.fees), slippageCost: Number(row.slippage_cost),
      maxDrawdown: Number(row.max_drawdown), profitFactor: Number(row.profit_factor), winRate: Number(row.win_rate), expectancy: Number(row.expectancy),
      avgTradePnl: Number(row.trade_count) ? Number(row.net_pnl) / Number(row.trade_count) : 0,
      byRegime: typeof row.by_regime === 'string' ? JSON.parse(row.by_regime) : row.by_regime as StrategyPerformanceSnapshot['byRegime'],
      attributionHash: String(row.attribution_hash),
    };
  }
}

export interface OpenTradeLot {
  strategyId: string;
  symbol: string;
  side: 'buy' | 'sell';
  qty: number;
  entryPrice: number;
  entryBenchmarkPrice: number;
  entryFee: number;
  entryTs: number;
  regime?: string;
  evidenceIds: string[];
  updatedAt?: number;
  decision?: import('./post-trade-feedback.ts').TradeDecisionFeedbackContext;
}

export interface PaperPostTradeTrackerState { open: OpenTradeLot[]; completed: PaperTradeAttribution[]; }

export class PaperPostTradeTracker {
  private readonly open = new Map<string, OpenTradeLot>();
  private readonly completed: PaperTradeAttribution[] = [];

  recordFill(fill: { clientOrderId: string; symbol: string; side: 'buy'|'sell'; qty: number; price: number; fee: number; slippageBps: number; benchmarkPrice: number; ts: number; strategyId?: string; regime?: string; evidenceIds?: string[]; decisionSubjectId?: string; decisionAction?: 'buy'|'sell'; decisionConfidence?: number; participantIds?: string[]; councilIds?: string[] }): PaperTradeAttribution[] {
    if (!fill.strategyId || !(fill.qty > 0)) return [];
    const key = `${fill.strategyId}:${fill.symbol}`;
    const current = this.open.get(key);
    if (!current || current.side === fill.side) {
      if (current && current.side === fill.side) {
        const totalQty = current.qty + fill.qty;
        current.entryPrice = ((current.entryPrice * current.qty) + (fill.price * fill.qty)) / totalQty;
        current.entryBenchmarkPrice = ((current.entryBenchmarkPrice * current.qty) + (fill.benchmarkPrice * fill.qty)) / totalQty;
        current.entryFee += fill.fee; current.qty = totalQty;
      } else {
        this.open.set(key, { strategyId:fill.strategyId, symbol:fill.symbol, side:fill.side, qty:fill.qty, entryPrice:fill.price, entryBenchmarkPrice:fill.benchmarkPrice, entryFee:fill.fee, entryTs:fill.ts, regime:fill.regime, evidenceIds:[...(fill.evidenceIds ?? [])], decision: fill.decisionSubjectId ? { decisionSubjectId: fill.decisionSubjectId, action: fill.decisionAction ?? fill.side, confidence: fill.decisionConfidence ?? 0, participantIds: [...(fill.participantIds ?? [])], councilIds: [...(fill.councilIds ?? [])] } : undefined });
      }
      return [];
    }
    const openQtyBeforeClose = current.qty;
    const closeQty = Math.min(openQtyBeforeClose, fill.qty);
    const openingQty = Math.max(0, fill.qty - closeQty);
    const entryFeeClosed = current.entryFee * (closeQty / openQtyBeforeClose);
    const exitFeeClosed = fill.fee * (closeQty / fill.qty);
    const openingFee = fill.fee * (openingQty / fill.qty);
    const direction = current.side === 'buy' ? 1 : -1;
    const grossPnl = (fill.benchmarkPrice - current.entryBenchmarkPrice) * closeQty * direction;
    const slippageCost = Math.abs(current.entryPrice - current.entryBenchmarkPrice) * closeQty
      + Math.abs(fill.price - fill.benchmarkPrice) * closeQty;
    const trade = attributePaperTrade({
      tradeId:`posttrade:${fill.clientOrderId}:${fill.ts}:${closeQty}`, strategyId:current.strategyId, symbol:fill.symbol, side:current.side, qty:closeQty,
      entryPrice:current.entryPrice, entryBenchmarkPrice:current.entryBenchmarkPrice, exitPrice:fill.price, exitBenchmarkPrice:fill.benchmarkPrice, grossPnl, fees:entryFeeClosed + exitFeeClosed, slippageCost,
      holdingMs:Math.max(0, fill.ts-current.entryTs), regime:fill.regime ?? current.regime, evidenceIds:[...new Set([...current.evidenceIds, ...(fill.evidenceIds ?? [])])], createdAt:fill.ts, decision: current.decision
    });
    this.completed.push(trade);
    current.qty -= closeQty;
    current.entryFee *= Math.max(0, 1 - closeQty / openQtyBeforeClose);
    if (current.qty <= 0) this.open.delete(key);
    else this.open.set(key, current);
    if (fill.qty > closeQty) {
      this.open.delete(key);
      const openingKey = `${fill.strategyId}:${fill.symbol}`;
      this.open.set(openingKey, { strategyId:fill.strategyId, symbol:fill.symbol, side:fill.side, qty:openingQty, entryPrice:fill.price, entryBenchmarkPrice:fill.benchmarkPrice, entryFee:openingFee, entryTs:fill.ts, regime:fill.regime, evidenceIds:[...(fill.evidenceIds ?? [])], decision: fill.decisionSubjectId ? { decisionSubjectId: fill.decisionSubjectId, action: fill.decisionAction ?? fill.side, confidence: fill.decisionConfidence ?? 0, participantIds: [...(fill.participantIds ?? [])], councilIds: [...(fill.councilIds ?? [])] } : undefined });
    }
    return [trade];
  }

  trades(strategyId?: string) { return structuredClone(strategyId ? this.completed.filter((t)=>t.strategyId===strategyId) : this.completed); }
  openLots() { return structuredClone([...this.open.values()]); }
  exportState(): PaperPostTradeTrackerState { return { open: this.openLots(), completed: this.trades() }; }
  restoreState(state: PaperPostTradeTrackerState | undefined): void {
    this.open.clear(); this.completed.length = 0;
    if (!state) return;
    for (const lot of state.open) this.open.set(`${lot.strategyId}:${lot.symbol}`, structuredClone(lot));
    this.completed.push(...structuredClone(state.completed));
  }
}

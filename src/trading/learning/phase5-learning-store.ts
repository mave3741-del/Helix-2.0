import type { Phase5LearningResult } from './phase5-learning-orchestrator.ts';
import type { ExecutionQualityFeedback } from '../execution/execution-quality-feedback.ts';

export interface Phase5LearningStore {
  saveCycle(result: Phase5LearningResult): Promise<void>;
  latestCycle(): Promise<Phase5LearningResult | null>;
  saveExecutionFeedback(feedback: ExecutionQualityFeedback[], createdAt?: number): Promise<void>;
}

export class InMemoryPhase5LearningStore implements Phase5LearningStore {
  private latest: Phase5LearningResult | null = null;
  private readonly execution = new Map<string, ExecutionQualityFeedback>();
  async saveCycle(result: Phase5LearningResult): Promise<void> { if (!this.latest || result.cycleId >= this.latest.cycleId) this.latest = structuredClone(result); }
  async latestCycle(): Promise<Phase5LearningResult | null> { return this.latest ? structuredClone(this.latest) : null; }
  async saveExecutionFeedback(feedback: ExecutionQualityFeedback[]): Promise<void> { for (const item of feedback) this.execution.set(`${item.strategyId}:${item.symbol}`, structuredClone(item)); }
}

interface SqlLike { query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>; }

export class SqlPhase5LearningStore implements Phase5LearningStore {
  private sqlPromise: Promise<SqlLike> | null = null;
  private sql(): Promise<SqlLike> {
    this.sqlPromise ??= import('../../lib/db.ts').then(({ getSql }) => getSql());
    return this.sqlPromise;
  }

  async saveCycle(result: Phase5LearningResult): Promise<void> {
    const sql = await this.sql();
    await sql.query(
      `insert into trading_phase5_learning_cycles
        (cycle_id, strategy_adaptation, allocations, champion_rotation, execution_throttle, fail_closed, reasons, decision_hash)
       values ($1,$2::jsonb,$3::jsonb,$4::jsonb,$5::jsonb,$6,$7::jsonb,$8)
       on conflict (cycle_id) do update set
         strategy_adaptation=excluded.strategy_adaptation,
         allocations=excluded.allocations,
         champion_rotation=excluded.champion_rotation,
         execution_throttle=excluded.execution_throttle,
         fail_closed=excluded.fail_closed,
         reasons=excluded.reasons,
         decision_hash=excluded.decision_hash`,
      [result.cycleId, JSON.stringify(result.strategyAdaptation), JSON.stringify(result.allocations), JSON.stringify(result.championRotation), JSON.stringify(result.executionThrottle), result.failClosed, JSON.stringify(result.reasons), result.decisionHash],
    );
  }

  async latestCycle(): Promise<Phase5LearningResult | null> {
    const sql = await this.sql();
    const rows = await sql.query<Record<string, unknown>>(
      `select cycle_id, strategy_adaptation, allocations, champion_rotation, execution_throttle, fail_closed, reasons, decision_hash
         from trading_phase5_learning_cycles order by created_at desc limit 1`,
    );
    const row = rows[0];
    if (!row) return null;
    const parse = <T>(value: unknown, fallback: T): T => typeof value === 'string' ? JSON.parse(value) as T : (value as T ?? fallback);
    return {
      cycleId: String(row.cycle_id),
      strategyAdaptation: parse(row.strategy_adaptation, []),
      allocations: parse(row.allocations, []),
      championRotation: parse(row.champion_rotation, { currentChampion: '', promotedChampion: null, challengerRank: [], rationale: [] }),
      executionThrottle: parse(row.execution_throttle, {}),
      failClosed: Boolean(row.fail_closed),
      reasons: parse(row.reasons, []),
      decisionHash: String(row.decision_hash),
    };
  }

  async saveExecutionFeedback(feedback: ExecutionQualityFeedback[], createdAt = Date.now()): Promise<void> {
    if (!feedback.length) return;
    const sql = await this.sql();
    for (const item of feedback) {
      const feedbackId = `execution-feedback:${item.strategyId}:${item.symbol}:${createdAt}:${item.quality.qualityScore.toFixed(4)}`;
      await sql.query(
        `insert into trading_execution_quality_feedback
          (feedback_id, strategy_id, symbol, implementation_shortfall_bps, fee_bps, slippage_bps, fill_rate, quality_score, execution_adjustment, action, created_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,to_timestamp($11/1000.0))
         on conflict (feedback_id) do nothing`,
        [feedbackId, item.strategyId, item.symbol, item.quality.implementationShortfallBps, item.quality.feeBps, item.quality.slippageBps, item.quality.fillRate, item.quality.qualityScore, item.executionAdjustment, item.action, createdAt],
      );
    }
  }
}

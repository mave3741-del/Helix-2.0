import { createHash } from 'node:crypto';

export type FeedbackOutcome = 'win' | 'loss' | 'flat';
export type FeedbackSubjectType = 'worker' | 'council';

export interface TradeDecisionFeedbackContext {
  decisionSubjectId: string;
  action: 'buy' | 'sell';
  confidence: number;
  participantIds: string[];
  councilIds: string[];
}

export interface PostTradeFeedbackRecord {
  feedbackId: string;
  tradeId: string;
  strategyId: string;
  symbol: string;
  decisionSubjectId: string;
  subjectType: FeedbackSubjectType;
  subjectId: string;
  action: 'buy' | 'sell';
  confidence: number;
  realizedNetPnl: number;
  outcome: FeedbackOutcome;
  decisionScore: number;
  calibrationError: number;
  creditShare: number;
  createdAt: number;
}

export interface MemberFeedbackSummary {
  subjectType: FeedbackSubjectType;
  subjectId: string;
  tradeCount: number;
  wins: number;
  losses: number;
  netPnl: number;
  avgDecisionScore: number;
  avgCalibrationError: number;
  reliability: number;
}

export interface PostTradeFeedbackStore {
  saveMany(records: PostTradeFeedbackRecord[]): Promise<void>;
  summary(subjectType: FeedbackSubjectType, subjectId: string): Promise<MemberFeedbackSummary | null>;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function outcomeFromPnl(netPnl: number): FeedbackOutcome {
  if (netPnl > 0) return 'win';
  if (netPnl < 0) return 'loss';
  return 'flat';
}

function stableIds(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort();
}

function hashRecord(input: unknown): string {
  return createHash('sha256').update(JSON.stringify(input)).digest('hex');
}

export function buildPostTradeFeedback(
  trade: {
    tradeId: string;
    strategyId: string;
    symbol: string;
    netPnl: number;
    createdAt: number;
    decision?: TradeDecisionFeedbackContext;
  },
): PostTradeFeedbackRecord[] {
  const decision = trade.decision;
  if (!decision) return [];
  const confidence = clamp01(decision.confidence);
  const outcome = outcomeFromPnl(trade.netPnl);
  const directionalSuccess = outcome === 'flat' ? 0.5 : outcome === 'win' ? 1 : 0;
  const decisionScore = outcome === 'flat' ? 0 : (directionalSuccess === 1 ? confidence : -confidence);
  const calibrationError = Math.abs(directionalSuccess - confidence);
  const members = stableIds(decision.participantIds);
  const councils = stableIds(decision.councilIds);
  const totalSubjects = members.length + councils.length;
  if (totalSubjects === 0) return [];
  const creditShare = 1 / totalSubjects;
  const base = {
    tradeId: trade.tradeId,
    strategyId: trade.strategyId,
    symbol: trade.symbol,
    decisionSubjectId: decision.decisionSubjectId,
    action: decision.action,
    confidence,
    realizedNetPnl: trade.netPnl,
    outcome,
    decisionScore,
    calibrationError,
    creditShare,
    createdAt: trade.createdAt,
  } as const;
  const records = [
    ...members.map((subjectId) => ({ subjectType: 'worker' as const, subjectId })),
    ...councils.map((subjectId) => ({ subjectType: 'council' as const, subjectId })),
  ].map((subject) => {
    const recordBase = { ...base, ...subject };
    return { ...recordBase, feedbackId: `feedback:${hashRecord(recordBase).slice(0, 32)}` };
  });
  return records;
}

export class InMemoryPostTradeFeedbackStore implements PostTradeFeedbackStore {
  private readonly records = new Map<string, PostTradeFeedbackRecord>();

  async saveMany(records: PostTradeFeedbackRecord[]): Promise<void> {
    for (const record of records) this.records.set(record.feedbackId, structuredClone(record));
  }

  async summary(subjectType: FeedbackSubjectType, subjectId: string): Promise<MemberFeedbackSummary | null> {
    const records = [...this.records.values()].filter((record) => record.subjectType === subjectType && record.subjectId === subjectId);
    if (!records.length) return null;
    const tradeIds = new Set(records.map((record) => record.tradeId));
    const wins = records.filter((record) => record.outcome === 'win').length;
    const losses = records.filter((record) => record.outcome === 'loss').length;
    const avgScore = records.reduce((sum, record) => sum + record.decisionScore, 0) / records.length;
    const avgCalibration = records.reduce((sum, record) => sum + record.calibrationError, 0) / records.length;
    const reliability = clamp01(0.5 + avgScore * 0.5 - avgCalibration * 0.25);
    return {
      subjectType,
      subjectId,
      tradeCount: tradeIds.size,
      wins,
      losses,
      netPnl: records.reduce((sum, record) => sum + record.realizedNetPnl * record.creditShare, 0),
      avgDecisionScore: avgScore,
      avgCalibrationError: avgCalibration,
      reliability,
    };
  }
}

interface SqlLike { query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>; }

export class SqlPostTradeFeedbackStore implements PostTradeFeedbackStore {
  private sqlPromise: Promise<SqlLike> | null = null;
  private sql(): Promise<SqlLike> {
    this.sqlPromise ??= import('../lib/db.ts').then(({ getSql }) => getSql());
    return this.sqlPromise;
  }

  async saveMany(records: PostTradeFeedbackRecord[]): Promise<void> {
    if (!records.length) return;
    const sql = await this.sql();
    for (const record of records) {
      await sql.query(
        `insert into trading_post_trade_feedback
          (feedback_id, trade_id, strategy_id, symbol, decision_subject_id, subject_type, subject_id, action, confidence, realized_net_pnl, outcome, decision_score, calibration_error, credit_share, created_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,to_timestamp($15/1000.0))
         on conflict (feedback_id) do nothing`,
        [record.feedbackId, record.tradeId, record.strategyId, record.symbol, record.decisionSubjectId, record.subjectType, record.subjectId, record.action, record.confidence, record.realizedNetPnl, record.outcome, record.decisionScore, record.calibrationError, record.creditShare, record.createdAt],
      );
    }
  }

  async summary(subjectType: FeedbackSubjectType, subjectId: string): Promise<MemberFeedbackSummary | null> {
    const sql = await this.sql();
    const rows = await sql.query<Record<string, unknown>>(
      `select subject_type, subject_id, count(distinct trade_id) as trade_count,
              count(*) filter (where outcome='win') as wins,
              count(*) filter (where outcome='loss') as losses,
              coalesce(sum(realized_net_pnl * credit_share),0) as net_pnl,
              coalesce(avg(decision_score),0) as avg_decision_score,
              coalesce(avg(calibration_error),0) as avg_calibration_error
         from trading_post_trade_feedback
        where subject_type=$1 and subject_id=$2
        group by subject_type, subject_id`,
      [subjectType, subjectId],
    );
    const row = rows[0];
    if (!row) return null;
    const avgDecisionScore = Number(row.avg_decision_score);
    const avgCalibrationError = Number(row.avg_calibration_error);
    return {
      subjectType,
      subjectId,
      tradeCount: Number(row.trade_count),
      wins: Number(row.wins),
      losses: Number(row.losses),
      netPnl: Number(row.net_pnl),
      avgDecisionScore,
      avgCalibrationError,
      reliability: clamp01(0.5 + avgDecisionScore * 0.5 - avgCalibrationError * 0.25),
    };
  }
}

export async function recordPostTradeFeedback(
  store: PostTradeFeedbackStore,
  trade: Parameters<typeof buildPostTradeFeedback>[0],
): Promise<PostTradeFeedbackRecord[]> {
  const records = buildPostTradeFeedback(trade);
  await store.saveMany(records);
  return records;
}

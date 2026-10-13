create table if not exists trading_post_trade_feedback (
  feedback_id text primary key,
  trade_id text not null,
  strategy_id text not null,
  symbol text not null,
  decision_subject_id text not null,
  subject_type text not null check (subject_type in ('worker','council')),
  subject_id text not null,
  action text not null check (action in ('buy','sell')),
  confidence double precision not null check (confidence >= 0 and confidence <= 1),
  realized_net_pnl double precision not null,
  outcome text not null check (outcome in ('win','loss','flat')),
  decision_score double precision not null,
  calibration_error double precision not null check (calibration_error >= 0),
  credit_share double precision not null check (credit_share > 0 and credit_share <= 1),
  created_at timestamptz not null,
  created_at_order bigint generated always as identity
);
create index if not exists trading_post_trade_feedback_subject_idx on trading_post_trade_feedback(subject_type, subject_id, created_at desc);
create index if not exists trading_post_trade_feedback_trade_idx on trading_post_trade_feedback(trade_id, created_at desc);

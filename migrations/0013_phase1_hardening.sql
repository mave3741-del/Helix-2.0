-- Phase 1 hardening: durable post-trade attribution fields and source/research metadata.
alter table trading_strategy_performance_snapshots add column if not exists gross_pnl double precision not null default 0;
alter table trading_strategy_performance_snapshots add column if not exists fees double precision not null default 0;
alter table trading_strategy_performance_snapshots add column if not exists slippage_cost double precision not null default 0;
alter table trading_strategy_performance_snapshots add column if not exists updated_at timestamptz not null default now();
create index if not exists idx_strategy_perf_hash on trading_strategy_performance_snapshots(attribution_hash);

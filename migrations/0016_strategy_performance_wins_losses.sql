-- StrategyPerformanceSnapshot has always computed `wins` and `losses`
-- (see src/trading/post-trade.ts), but the SQL-backed store never had
-- columns to persist them and silently dropped them on save()/latest(),
-- which would have been a real data-loss bug the moment the SQL store
-- was used instead of the in-memory one. Backfill existing rows from
-- win_rate * trade_count as a best-effort reconstruction (exact for any
-- row written going forward).
alter table trading_strategy_performance_snapshots add column if not exists wins integer not null default 0;
alter table trading_strategy_performance_snapshots add column if not exists losses integer not null default 0;

update trading_strategy_performance_snapshots
set wins = round(win_rate * trade_count)::integer
where wins = 0 and trade_count > 0 and win_rate > 0;

alter table trading_closed_loop_cycles
  add column if not exists decision_hash text;

create unique index if not exists trading_closed_loop_cycles_hash_idx
  on trading_closed_loop_cycles(decision_hash)
  where decision_hash is not null;

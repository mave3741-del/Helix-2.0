-- Debate critique-turn persistence. Smart-money/performance tables live in 0010.
alter table trading_debate_turns add column if not exists turn_type text not null default 'initial';
alter table trading_debate_turns drop constraint if exists trading_debate_turns_session_id_round_worker_id_key;
create unique index if not exists trading_debate_turns_session_round_worker_type_idx
  on trading_debate_turns(session_id, round, worker_id, turn_type);

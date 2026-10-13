-- Durable evidence packets, evidence fan-out records, specialist councils,
-- and multi-round debate state for the 1,000-worker trading organization.

create table if not exists trading_evidence_packets (
  evidence_id text primary key,
  subject_id text not null,
  evidence_type text not null,
  claim text not null,
  confidence double precision not null check (confidence >= 0 and confidence <= 1),
  source text not null,
  event_ts bigint not null,
  published_at timestamptz,
  retrieved_at timestamptz not null,
  payload jsonb not null,
  provenance jsonb not null,
  content_hash text not null,
  created_at timestamptz not null default current_timestamp
);

create index if not exists trading_evidence_subject_idx
  on trading_evidence_packets (subject_id, event_ts desc, evidence_id);
create index if not exists trading_evidence_type_idx
  on trading_evidence_packets (evidence_type, event_ts desc, evidence_id);
create index if not exists trading_evidence_hash_idx
  on trading_evidence_packets (content_hash);

create table if not exists trading_evidence_fanout (
  fanout_id text primary key,
  evidence_id text not null references trading_evidence_packets(evidence_id) on delete cascade,
  worker_id text not null,
  task_id text not null,
  routing jsonb not null,
  created_at timestamptz not null default current_timestamp,
  unique (evidence_id, worker_id),
  unique (task_id)
);

create index if not exists trading_evidence_fanout_worker_idx
  on trading_evidence_fanout (worker_id, created_at desc);

create table if not exists trading_debate_sessions (
  session_id text primary key,
  subject_id text not null,
  topic text not null,
  status text not null check (status in ('open','finalized','rejected')),
  current_round integer not null default 0 check (current_round >= 0),
  participants jsonb not null,
  council_ids jsonb not null,
  decision jsonb,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  finalized_at timestamptz
);

create index if not exists trading_debate_subject_idx
  on trading_debate_sessions (subject_id, updated_at desc);

create table if not exists trading_debate_rounds (
  session_id text not null references trading_debate_sessions(session_id) on delete cascade,
  round integer not null check (round > 0),
  status text not null check (status in ('open','closed')),
  opened_at timestamptz not null,
  closed_at timestamptz,
  primary key (session_id, round)
);

create table if not exists trading_debate_turns (
  turn_id text primary key,
  session_id text not null references trading_debate_sessions(session_id) on delete cascade,
  round integer not null,
  worker_id text not null,
  stance text not null check (stance in ('bull','bear','neutral','abstain')),
  argument text not null,
  evidence_ids jsonb not null,
  confidence double precision not null check (confidence >= 0 and confidence <= 1),
  challenge_turn_ids jsonb not null,
  created_at timestamptz not null,
  unique (session_id, round, worker_id),
  foreign key (session_id, round) references trading_debate_rounds(session_id, round) on delete cascade
);

create index if not exists trading_debate_turns_session_idx
  on trading_debate_turns (session_id, round, created_at, worker_id);

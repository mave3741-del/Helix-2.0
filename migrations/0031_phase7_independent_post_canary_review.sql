create table if not exists trading_phase7_independent_post_canary_reviews (
  review_id text primary key,
  status text not null check (status in ('approved','blocked')),
  reviewer_id text not null,
  implementer_id text not null,
  review_snapshot jsonb not null,
  evidence_hash text not null,
  created_at timestamptz not null default now(),
  check (reviewer_id <> implementer_id)
);

create index if not exists trading_phase7_independent_post_canary_reviews_created_idx
  on trading_phase7_independent_post_canary_reviews(created_at desc);

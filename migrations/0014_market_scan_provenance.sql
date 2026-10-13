create table if not exists trading_market_scan_provenance (
  scan_id text primary key,
  cadence text not null,
  started_at timestamptz not null,
  completed_at timestamptz not null,
  universe_id text,
  universe_version text,
  universe_as_of_ts timestamptz,
  universe_size integer not null check (universe_size >= 0 and universe_size <= 1000),
  valid_markets integer not null check (valid_markets >= 0),
  rejected_markets integer not null check (rejected_markets >= 0),
  score_version text not null,
  policy_version text not null,
  provenance jsonb,
  rejection_reasons jsonb,
  candidates jsonb not null,
  recorded_at timestamptz not null default now()
);
create index if not exists trading_market_scan_provenance_completed_idx on trading_market_scan_provenance(completed_at desc, scan_id);
create index if not exists trading_market_scan_provenance_universe_idx on trading_market_scan_provenance(universe_id, universe_version, completed_at desc);

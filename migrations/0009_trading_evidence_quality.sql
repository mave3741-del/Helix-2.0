-- Evidence quality is durable and queryable alongside provenance.
alter table if exists trading_evidence_packets
  add column if not exists quality jsonb;

create index if not exists trading_evidence_quality_idx
  on trading_evidence_packets (((quality->>'score')::double precision));

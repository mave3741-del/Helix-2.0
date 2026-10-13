alter table _migrations
  add column if not exists content_sha256 text;
create index if not exists _migrations_content_hash_idx on _migrations(content_sha256);

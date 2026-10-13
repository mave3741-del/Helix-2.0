CREATE OR REPLACE FUNCTION reject_external_intelligence_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'external_intelligence_registry_is_append_only';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS external_intelligence_registry_no_update ON external_intelligence_registry;
CREATE TRIGGER external_intelligence_registry_no_update
BEFORE UPDATE OR DELETE ON external_intelligence_registry
FOR EACH ROW EXECUTE FUNCTION reject_external_intelligence_mutation();

ALTER TABLE external_intelligence_registry
  ADD COLUMN IF NOT EXISTS title TEXT,
  ADD COLUMN IF NOT EXISTS text TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS external_intelligence_registry_evidence_hash_uq
  ON external_intelligence_registry (evidence_hash);

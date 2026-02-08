-- Prevent jsonb double-encoding regressions (json stored as jsonb strings)
-- Date: 2026-02-05

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ex_journal_entry_metadata_json_object_chk'
  ) THEN
    ALTER TABLE ex_journal_entry
      ADD CONSTRAINT ex_journal_entry_metadata_json_object_chk
      CHECK (jsonb_typeof(metadata_json) = 'object');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'evidence_object_metadata_json_object_chk'
  ) THEN
    ALTER TABLE evidence_object
      ADD CONSTRAINT evidence_object_metadata_json_object_chk
      CHECK (jsonb_typeof(metadata_json) = 'object');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'market_snapshot_raw_json_not_string_chk'
  ) THEN
    ALTER TABLE market_snapshot
      ADD CONSTRAINT market_snapshot_raw_json_not_string_chk
      CHECK (jsonb_typeof(raw_json) <> 'string');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'risk_assessment_factors_json_not_string_chk'
  ) THEN
    ALTER TABLE risk_assessment
      ADD CONSTRAINT risk_assessment_factors_json_not_string_chk
      CHECK (jsonb_typeof(factors_json) <> 'string');
  END IF;
END $$;

COMMIT;

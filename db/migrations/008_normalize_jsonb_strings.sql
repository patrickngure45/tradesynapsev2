-- Normalize jsonb columns that were accidentally stored as JSON strings
-- Date: 2026-02-05

BEGIN;

-- Some code paths previously passed objects through JSON.stringify before binding,
-- but the driver already JSON-serializes objects for json/jsonb parameters.
-- That double-encoding produced jsonb values of type "string" whose contents are
-- JSON text (e.g. "{\"a\":1}"). This migration unwraps those into proper jsonb.

UPDATE ex_journal_entry
SET metadata_json = (metadata_json #>> '{}')::jsonb
WHERE jsonb_typeof(metadata_json) = 'string'
  AND (metadata_json #>> '{}') ~ '^\s*[\[{]';

UPDATE evidence_object
SET metadata_json = (metadata_json #>> '{}')::jsonb
WHERE jsonb_typeof(metadata_json) = 'string'
  AND (metadata_json #>> '{}') ~ '^\s*[\[{]';

UPDATE market_snapshot
SET raw_json = (raw_json #>> '{}')::jsonb
WHERE jsonb_typeof(raw_json) = 'string'
  AND (raw_json #>> '{}') ~ '^\s*[\[{]';

UPDATE risk_assessment
SET factors_json = (factors_json #>> '{}')::jsonb
WHERE jsonb_typeof(factors_json) = 'string'
  AND (factors_json #>> '{}') ~ '^\s*[\[{]';

COMMIT;

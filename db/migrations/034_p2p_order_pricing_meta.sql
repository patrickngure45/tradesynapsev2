BEGIN;

ALTER TABLE p2p_order
  ADD COLUMN IF NOT EXISTS reference_mid numeric(38,18) NULL,
  ADD COLUMN IF NOT EXISTS reference_sources jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS reference_computed_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS price_band_pct numeric(10,6) NULL;

COMMIT;

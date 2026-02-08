-- Trade fair-price band columns
-- Date: 2026-02-03

BEGIN;

ALTER TABLE trade
  ADD COLUMN IF NOT EXISTS fair_price_mid numeric(38,18) NULL,
  ADD COLUMN IF NOT EXISTS fair_price_lower numeric(38,18) NULL,
  ADD COLUMN IF NOT EXISTS fair_price_upper numeric(38,18) NULL,
  ADD COLUMN IF NOT EXISTS fair_band_pct numeric(10,6) NULL,
  ADD COLUMN IF NOT EXISTS fair_price_basis text NULL,
  ADD COLUMN IF NOT EXISTS price_deviation_pct numeric(20,10) NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'trade_fair_price_basis_chk'
  ) THEN
    ALTER TABLE trade
      ADD CONSTRAINT trade_fair_price_basis_chk
      CHECK (fair_price_basis IS NULL OR fair_price_basis IN ('bid_ask_mid','last'));
  END IF;
END $$;

COMMIT;

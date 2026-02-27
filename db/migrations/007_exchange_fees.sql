-- Exchange MVP: fees (maker/taker) charged in quote asset
-- Date: 2026-02-05

BEGIN;

-- Stable system user for internal ledger accounts (fees, burn, etc.)
-- NOTE: app_user has no "role" column yet; we use a reserved UUID.
INSERT INTO app_user (id, status, kyc_level, country)
VALUES ('00000000-0000-0000-0000-000000000001'::uuid, 'active', 'none', NULL)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE ex_market
  ADD COLUMN IF NOT EXISTS maker_fee_bps integer NOT NULL DEFAULT 0 CHECK (maker_fee_bps >= 0 AND maker_fee_bps <= 10_000),
  ADD COLUMN IF NOT EXISTS taker_fee_bps integer NOT NULL DEFAULT 0 CHECK (taker_fee_bps >= 0 AND taker_fee_bps <= 10_000);

ALTER TABLE ex_execution
  ADD COLUMN IF NOT EXISTS maker_fee_quote numeric(38,18) NOT NULL DEFAULT 0 CHECK (maker_fee_quote >= 0),
  ADD COLUMN IF NOT EXISTS taker_fee_quote numeric(38,18) NOT NULL DEFAULT 0 CHECK (taker_fee_quote >= 0);

COMMIT;

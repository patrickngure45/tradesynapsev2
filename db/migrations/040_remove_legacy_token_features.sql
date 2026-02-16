-- Cleanup: remove legacy token features
-- Date: 2026-02-15

BEGIN;

-- Remove deprecated fee preference column and index (legacy)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'idx_users_pay_fees_with_tst'
  ) THEN
    EXECUTE 'DROP INDEX idx_users_pay_fees_with_tst';
  END IF;
END $$;

ALTER TABLE app_user
  DROP COLUMN IF EXISTS pay_fees_with_tst;

-- Disable legacy assets (name-based to avoid reintroducing token symbols)
UPDATE ex_asset
SET is_enabled = false
WHERE chain = 'bsc'
  AND name IN ('TradeSynapse Token', 'TradeSynapse Gas');

-- Disable markets that reference legacy assets
UPDATE ex_market m
SET status = 'disabled'
WHERE m.chain = 'bsc'
  AND (
    m.base_asset_id IN (
      SELECT id
      FROM ex_asset
      WHERE chain = 'bsc'
        AND name IN ('TradeSynapse Token', 'TradeSynapse Gas')
    )
    OR m.quote_asset_id IN (
      SELECT id
      FROM ex_asset
      WHERE chain = 'bsc'
        AND name IN ('TradeSynapse Token', 'TradeSynapse Gas')
    )
  );

COMMIT;

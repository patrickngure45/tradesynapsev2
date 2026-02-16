-- Multi-chain scaffolding + memo/tag-capable deposit attribution
-- Date: 2026-02-13

BEGIN;

ALTER TABLE ex_asset DROP CONSTRAINT IF EXISTS ex_asset_chain_check;
ALTER TABLE ex_market DROP CONSTRAINT IF EXISTS ex_market_chain_check;
ALTER TABLE ex_deposit_address DROP CONSTRAINT IF EXISTS ex_deposit_address_chain_check;

-- Expand supported chain set beyond 'bsc'
DO $$
DECLARE
  c record;
BEGIN
  -- ex_asset
  FOR c IN (
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'ex_asset'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%chain%IN (%'
  ) LOOP
    EXECUTE format('ALTER TABLE ex_asset DROP CONSTRAINT IF EXISTS %I', c.conname);
  END LOOP;

  EXECUTE 'ALTER TABLE ex_asset
    ADD CONSTRAINT ex_asset_chain_check
    CHECK (chain IN (''bsc'',''eth'',''btc'',''tron'',''polygon'',''avalanche'',''solana'',''cardano'',''xrp''))';

  -- ex_market
  FOR c IN (
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'ex_market'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%chain%IN (%'
  ) LOOP
    EXECUTE format('ALTER TABLE ex_market DROP CONSTRAINT IF EXISTS %I', c.conname);
  END LOOP;

  EXECUTE 'ALTER TABLE ex_market
    ADD CONSTRAINT ex_market_chain_check
    CHECK (chain IN (''bsc'',''eth'',''btc'',''tron'',''polygon'',''avalanche'',''solana'',''cardano'',''xrp''))';

  -- ex_deposit_address
  FOR c IN (
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'ex_deposit_address'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%chain%IN (%'
  ) LOOP
    EXECUTE format('ALTER TABLE ex_deposit_address DROP CONSTRAINT IF EXISTS %I', c.conname);
  END LOOP;

  EXECUTE 'ALTER TABLE ex_deposit_address
    ADD CONSTRAINT ex_deposit_address_chain_check
    CHECK (chain IN (''bsc'',''eth'',''btc'',''tron'',''polygon'',''avalanche'',''solana'',''cardano'',''xrp''))';
END $$;

-- Add optional memo/tag field for chains that use destination tags / memos.
ALTER TABLE ex_deposit_address
  ADD COLUMN IF NOT EXISTS memo text NULL;

-- Replace strict (chain,address) uniqueness with a model that supports:
-- - Unique-address deposits (memo is NULL): enforce unique(chain,address) where memo IS NULL
-- - Shared-address + memo deposits: enforce unique(chain,address,memo) where memo IS NOT NULL
ALTER TABLE ex_deposit_address
  DROP CONSTRAINT IF EXISTS ex_deposit_address_chain_address_uniq;

DROP INDEX IF EXISTS ex_deposit_address_chain_address_uniq;

CREATE UNIQUE INDEX IF NOT EXISTS ex_deposit_address_chain_address_unique_no_memo
  ON ex_deposit_address(chain, address)
  WHERE memo IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ex_deposit_address_chain_address_memo_unique
  ON ex_deposit_address(chain, address, memo)
  WHERE memo IS NOT NULL;

COMMIT;

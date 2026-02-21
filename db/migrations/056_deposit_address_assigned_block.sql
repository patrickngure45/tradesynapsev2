-- Track the approximate chain block when a deposit address was assigned.
-- This prevents accidental genesis-to-tip backfills and helps scanners start near relevant history.

BEGIN;

ALTER TABLE ex_deposit_address
  ADD COLUMN IF NOT EXISTS assigned_block bigint NULL;

CREATE INDEX IF NOT EXISTS ex_deposit_address_chain_assigned_block_idx
  ON ex_deposit_address(chain, assigned_block)
  WHERE assigned_block IS NOT NULL;

COMMIT;

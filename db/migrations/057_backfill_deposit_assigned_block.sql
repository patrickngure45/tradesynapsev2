-- Backfill assigned_block for existing active deposit addresses.
-- Uses current scan cursor as a safe approximation.

BEGIN;

UPDATE ex_deposit_address d
SET assigned_block = c.last_scanned_block,
    created_at = d.created_at
FROM ex_chain_deposit_cursor c
WHERE d.chain = c.chain
  AND d.status = 'active'
  AND d.assigned_block IS NULL;

COMMIT;

BEGIN;

-- Add cached balance columns to ledger account for easier query performance
-- and compatibility with application logic.
ALTER TABLE ex_ledger_account 
ADD COLUMN IF NOT EXISTS balance numeric(38,18) NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS locked numeric(38,18) NOT NULL DEFAULT 0;

-- Backfill balances from journal lines (if any exist)
-- Note: We assume 'locked' is managed via ex_hold logic or manual updates.
-- If ex_hold was strictly used, we might calculate locked from there,
-- but for now we initialize locked to 0.
WITH calculated_balances AS (
  SELECT account_id, sum(amount) as net_amount
  FROM ex_journal_line
  GROUP BY account_id
)
UPDATE ex_ledger_account
SET balance = c.net_amount
FROM calculated_balances c
WHERE ex_ledger_account.id = c.account_id;

COMMIT;

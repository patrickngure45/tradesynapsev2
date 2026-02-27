BEGIN;

-- Withdrawal priority boosts: allow a user to spend an Arcade boost to prioritize review.
-- Date: 2026-02-21

ALTER TABLE ex_withdrawal_request
  ADD COLUMN IF NOT EXISTS priority_until timestamptz NULL,
  ADD COLUMN IF NOT EXISTS priority_boost_code text NULL,
  ADD COLUMN IF NOT EXISTS priority_applied_at timestamptz NULL;

CREATE INDEX IF NOT EXISTS ex_withdrawal_request_priority_until_idx
  ON ex_withdrawal_request(priority_until DESC)
  WHERE priority_until IS NOT NULL;

COMMIT;

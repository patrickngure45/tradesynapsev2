-- Pending deposit holds for instant credit UX
-- Date: 2026-02-18

BEGIN;

-- Track whether a deposit event is still pending confirmations, confirmed, or reverted.
ALTER TABLE ex_chain_deposit_event
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'confirmed'
  CHECK (status IN ('pending','confirmed','reverted'));

ALTER TABLE ex_chain_deposit_event
  ADD COLUMN IF NOT EXISTS credited_at timestamptz NULL;

ALTER TABLE ex_chain_deposit_event
  ADD COLUMN IF NOT EXISTS confirmed_at timestamptz NULL;

ALTER TABLE ex_chain_deposit_event
  ADD COLUMN IF NOT EXISTS hold_id uuid NULL REFERENCES ex_hold(id) ON DELETE SET NULL;

-- Helpful for workers that finalize pending events.
CREATE INDEX IF NOT EXISTS ex_chain_deposit_event_chain_status_block_idx
  ON ex_chain_deposit_event(chain, status, block_number);

COMMIT;

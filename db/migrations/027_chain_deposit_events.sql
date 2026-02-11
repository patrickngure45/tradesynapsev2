-- Chain deposit events (idempotent crediting)
-- Supports automated deposit crediting by observing on-chain transfers.

BEGIN;

CREATE TABLE IF NOT EXISTS ex_chain_deposit_cursor (
  chain text PRIMARY KEY,
  last_scanned_block integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ex_chain_deposit_event (
  id bigserial PRIMARY KEY,
  chain text NOT NULL,
  tx_hash text NOT NULL,
  log_index integer NOT NULL,
  block_number integer NOT NULL,
  from_address text NULL,
  to_address text NOT NULL,

  user_id uuid NOT NULL REFERENCES app_user(id),
  asset_id uuid NOT NULL REFERENCES ex_asset(id),
  amount numeric NOT NULL CHECK (amount > 0),

  journal_entry_id uuid NULL,

  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT ex_chain_deposit_event_uniq UNIQUE (chain, tx_hash, log_index)
);

CREATE INDEX IF NOT EXISTS ex_chain_deposit_event_user_created_idx
  ON ex_chain_deposit_event(user_id, created_at DESC);

COMMIT;

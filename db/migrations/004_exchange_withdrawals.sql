-- Exchange withdrawals (allowlist-first) - ledger-only skeleton.

CREATE TABLE IF NOT EXISTS ex_withdrawal_allowlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app_user(id),
  chain text NOT NULL,
  address text NOT NULL,
  label text NULL,
  status text NOT NULL DEFAULT 'active', -- active | disabled
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ex_withdrawal_allowlist_user_chain_address_uq
  ON ex_withdrawal_allowlist(user_id, chain, address);

CREATE INDEX IF NOT EXISTS ex_withdrawal_allowlist_user_chain_idx
  ON ex_withdrawal_allowlist(user_id, chain);


CREATE TABLE IF NOT EXISTS ex_withdrawal_request (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app_user(id),
  asset_id uuid NOT NULL REFERENCES ex_asset(id),
  amount numeric NOT NULL CHECK (amount > 0),
  destination_address text NOT NULL,
  allowlist_id uuid NULL REFERENCES ex_withdrawal_allowlist(id),
  hold_id uuid NULL REFERENCES ex_hold(id),

  status text NOT NULL DEFAULT 'requested',
  -- requested | canceled | rejected | approved | broadcasted | confirmed | failed
  reference text NULL,
  tx_hash text NULL,
  failure_reason text NULL,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  approved_by text NULL,
  approved_at timestamptz NULL
);

CREATE INDEX IF NOT EXISTS ex_withdrawal_request_user_created_idx
  ON ex_withdrawal_request(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS ex_withdrawal_request_status_idx
  ON ex_withdrawal_request(status);

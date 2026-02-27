-- Earn MVP: custodial Simple Earn + Locked Earn (ledger-held principal, claimable interest)
-- Date: 2026-02-24

BEGIN;

CREATE TABLE IF NOT EXISTS earn_product (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chain text NOT NULL CHECK (chain IN ('bsc')),
  asset_id uuid NOT NULL REFERENCES ex_asset(id) ON DELETE RESTRICT,
  kind text NOT NULL CHECK (kind IN ('flexible','locked')),
  lock_days integer NULL CHECK (lock_days IS NULL OR lock_days >= 1),
  apr_bps integer NOT NULL CHECK (apr_bps >= 0 AND apr_bps <= 1_000_000),
  status text NOT NULL DEFAULT 'enabled' CHECK (status IN ('enabled','disabled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT earn_product_kind_lock_days_chk CHECK (
    (kind = 'flexible' AND lock_days IS NULL) OR
    (kind = 'locked' AND lock_days IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS earn_product_uniq
  ON earn_product(asset_id, kind, COALESCE(lock_days, 0));

CREATE INDEX IF NOT EXISTS earn_product_status_idx
  ON earn_product(chain, status, kind, asset_id);

CREATE TABLE IF NOT EXISTS earn_position (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES earn_product(id) ON DELETE RESTRICT,

  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','closed')),

  principal_amount numeric(38,18) NOT NULL CHECK (principal_amount > 0),
  apr_bps integer NOT NULL CHECK (apr_bps >= 0 AND apr_bps <= 1_000_000),
  kind text NOT NULL CHECK (kind IN ('flexible','locked')),
  lock_days integer NULL CHECK (lock_days IS NULL OR lock_days >= 1),

  started_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz NULL,

  last_claim_at timestamptz NULL,

  hold_id uuid NULL REFERENCES ex_hold(id) ON DELETE RESTRICT,

  closed_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT earn_position_kind_lock_days_chk CHECK (
    (kind = 'flexible' AND lock_days IS NULL AND ends_at IS NULL) OR
    (kind = 'locked' AND lock_days IS NOT NULL AND ends_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS earn_position_user_created_idx
  ON earn_position(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS earn_position_status_user_idx
  ON earn_position(status, user_id, created_at DESC);

COMMIT;

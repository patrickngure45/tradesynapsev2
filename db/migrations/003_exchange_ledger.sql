-- Exchange MVP (Option B): ledger + custody primitives (BSC-first)
-- Date: 2026-02-04

BEGIN;

-- Assets (BSC-first; designed to add chains later)
CREATE TABLE IF NOT EXISTS ex_asset (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chain text NOT NULL CHECK (chain IN ('bsc')),
  symbol text NOT NULL,
  name text NULL,
  contract_address text NULL,
  decimals integer NOT NULL CHECK (decimals >= 0 AND decimals <= 36),
  is_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ex_asset_chain_symbol_uniq UNIQUE (chain, symbol),
  CONSTRAINT ex_asset_chain_contract_uniq UNIQUE (chain, contract_address)
);

-- Allow multiple NULL contract_address values (native assets like BNB) by relaxing uniqueness via a partial index.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ex_asset_chain_contract_uniq'
  ) THEN
    -- The UNIQUE constraint allows multiple NULLs in Postgres; keep as-is.
    NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS ex_asset_enabled_idx ON ex_asset(chain, is_enabled);

-- Per-user ledger accounts per asset (authoritative balances via journal lines)
CREATE TABLE IF NOT EXISTS ex_ledger_account (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE RESTRICT,
  asset_id uuid NOT NULL REFERENCES ex_asset(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','frozen')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ex_ledger_account_user_asset_uniq UNIQUE (user_id, asset_id)
);

CREATE INDEX IF NOT EXISTS ex_ledger_account_user_idx ON ex_ledger_account(user_id);

-- Journal entries group lines into an atomic accounting event.
CREATE TABLE IF NOT EXISTS ex_journal_entry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL,
  reference text NULL,
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ex_journal_entry_type_created_idx
  ON ex_journal_entry(type, created_at DESC);

-- Journal lines: signed amounts; for each (entry_id, asset_id) the sum must be zero.
-- Convention: amount > 0 credits the account, amount < 0 debits the account.
CREATE TABLE IF NOT EXISTS ex_journal_line (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id uuid NOT NULL REFERENCES ex_journal_entry(id) ON DELETE RESTRICT,
  account_id uuid NOT NULL REFERENCES ex_ledger_account(id) ON DELETE RESTRICT,
  asset_id uuid NOT NULL REFERENCES ex_asset(id) ON DELETE RESTRICT,
  amount numeric(38,18) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ex_journal_line_amount_nonzero CHECK (amount <> 0)
);

CREATE INDEX IF NOT EXISTS ex_journal_line_entry_idx ON ex_journal_line(entry_id);
CREATE INDEX IF NOT EXISTS ex_journal_line_account_idx ON ex_journal_line(account_id);

-- Holds reserve funds for open orders. Holds do not change posted balance.
CREATE TABLE IF NOT EXISTS ex_hold (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES ex_ledger_account(id) ON DELETE RESTRICT,
  asset_id uuid NOT NULL REFERENCES ex_asset(id) ON DELETE RESTRICT,
  amount numeric(38,18) NOT NULL CHECK (amount > 0),
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','released','consumed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  released_at timestamptz NULL
);

CREATE INDEX IF NOT EXISTS ex_hold_account_status_idx ON ex_hold(account_id, status);

-- Deposit addresses (attribution). Address generation is a custody concern (KMS/HSM); this table stores assigned addresses.
CREATE TABLE IF NOT EXISTS ex_deposit_address (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE RESTRICT,
  chain text NOT NULL CHECK (chain IN ('bsc')),
  address text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','retired')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ex_deposit_address_chain_address_uniq UNIQUE (chain, address),
  CONSTRAINT ex_deposit_address_user_chain_uniq UNIQUE (user_id, chain)
);

-- Enforce journal balancing at transaction commit.
CREATE OR REPLACE FUNCTION ex_assert_journal_entry_balanced(p_entry_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  bad_asset uuid;
  bad_sum numeric(38,18);
BEGIN
  SELECT asset_id, sum(amount)
  INTO bad_asset, bad_sum
  FROM ex_journal_line
  WHERE entry_id = p_entry_id
  GROUP BY asset_id
  HAVING sum(amount) <> 0
  LIMIT 1;

  IF bad_asset IS NOT NULL THEN
    RAISE EXCEPTION 'ex_journal_entry_not_balanced entry_id=% asset_id=% sum=%', p_entry_id, bad_asset, bad_sum;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION ex_journal_line_balance_trigger()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM ex_assert_journal_entry_balanced(NEW.entry_id);
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    PERFORM ex_assert_journal_entry_balanced(NEW.entry_id);
    IF NEW.entry_id IS DISTINCT FROM OLD.entry_id THEN
      PERFORM ex_assert_journal_entry_balanced(OLD.entry_id);
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM ex_assert_journal_entry_balanced(OLD.entry_id);
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'ex_journal_line_balance_chk'
  ) THEN
    CREATE CONSTRAINT TRIGGER ex_journal_line_balance_chk
      AFTER INSERT OR UPDATE OR DELETE ON ex_journal_line
      DEFERRABLE INITIALLY DEFERRED
      FOR EACH ROW
      EXECUTE FUNCTION ex_journal_line_balance_trigger();
  END IF;
END $$;

COMMIT;

-- Maintain cached balances on ex_ledger_account (balance, locked)
-- Date: 2026-02-19

BEGIN;

-- Ensure the cache columns exist (migration 027) so this is safe on older DBs.
ALTER TABLE ex_ledger_account
  ADD COLUMN IF NOT EXISTS balance numeric(38,18) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS locked numeric(38,18) NOT NULL DEFAULT 0;

-- ── Posted balance cache (journal lines) ───────────────────────────

CREATE OR REPLACE FUNCTION ex_ledger_apply_balance_delta(p_account_id uuid, p_delta numeric)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF p_delta = 0 THEN
    RETURN;
  END IF;

  UPDATE ex_ledger_account
  SET balance = balance + p_delta
  WHERE id = p_account_id;
END;
$$;

CREATE OR REPLACE FUNCTION ex_ledger_journal_line_cache_trg()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM ex_ledger_apply_balance_delta(NEW.account_id, NEW.amount);
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    -- If account_id changes, reverse old line then apply new.
    IF NEW.account_id IS DISTINCT FROM OLD.account_id THEN
      PERFORM ex_ledger_apply_balance_delta(OLD.account_id, (OLD.amount * -1));
      PERFORM ex_ledger_apply_balance_delta(NEW.account_id, NEW.amount);
    ELSE
      PERFORM ex_ledger_apply_balance_delta(NEW.account_id, (NEW.amount - OLD.amount));
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM ex_ledger_apply_balance_delta(OLD.account_id, (OLD.amount * -1));
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
    WHERE tgname = 'ex_journal_line_cache_balance'
  ) THEN
    CREATE TRIGGER ex_journal_line_cache_balance
      AFTER INSERT OR UPDATE OR DELETE ON ex_journal_line
      FOR EACH ROW
      EXECUTE FUNCTION ex_ledger_journal_line_cache_trg();
  END IF;
END $$;

-- ── Locked cache (active holds) ───────────────────────────────────

CREATE OR REPLACE FUNCTION ex_ledger_apply_locked_delta(p_account_id uuid, p_delta numeric)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF p_delta = 0 THEN
    RETURN;
  END IF;

  UPDATE ex_ledger_account
  SET locked = locked + p_delta
  WHERE id = p_account_id;
END;
$$;

CREATE OR REPLACE FUNCTION ex_ledger_hold_cache_trg()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  old_amt numeric;
  new_amt numeric;
  old_active boolean;
  new_active boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    new_active := (NEW.status = 'active');
    IF new_active THEN
      new_amt := COALESCE(NEW.remaining_amount, NEW.amount);
      PERFORM ex_ledger_apply_locked_delta(NEW.account_id, new_amt);
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    old_active := (OLD.status = 'active');
    new_active := (NEW.status = 'active');

    old_amt := CASE WHEN old_active THEN COALESCE(OLD.remaining_amount, OLD.amount) ELSE 0 END;
    new_amt := CASE WHEN new_active THEN COALESCE(NEW.remaining_amount, NEW.amount) ELSE 0 END;

    IF NEW.account_id IS DISTINCT FROM OLD.account_id THEN
      IF old_amt <> 0 THEN
        PERFORM ex_ledger_apply_locked_delta(OLD.account_id, (old_amt * -1));
      END IF;
      IF new_amt <> 0 THEN
        PERFORM ex_ledger_apply_locked_delta(NEW.account_id, new_amt);
      END IF;
    ELSE
      PERFORM ex_ledger_apply_locked_delta(NEW.account_id, (new_amt - old_amt));
    END IF;

    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    old_active := (OLD.status = 'active');
    IF old_active THEN
      old_amt := COALESCE(OLD.remaining_amount, OLD.amount);
      PERFORM ex_ledger_apply_locked_delta(OLD.account_id, (old_amt * -1));
    END IF;
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
    WHERE tgname = 'ex_hold_cache_locked'
  ) THEN
    CREATE TRIGGER ex_hold_cache_locked
      AFTER INSERT OR UPDATE OR DELETE ON ex_hold
      FOR EACH ROW
      EXECUTE FUNCTION ex_ledger_hold_cache_trg();
  END IF;
END $$;

-- One-time backfill to correct any existing drift.
WITH posted AS (
  SELECT account_id, coalesce(sum(amount), 0)::numeric AS posted
  FROM ex_journal_line
  GROUP BY account_id
),
held AS (
  SELECT account_id, coalesce(sum(COALESCE(remaining_amount, amount)), 0)::numeric AS held
  FROM ex_hold
  WHERE status = 'active'
  GROUP BY account_id
)
UPDATE ex_ledger_account la
SET
  balance = coalesce(p.posted, 0),
  locked = coalesce(h.held, 0)
FROM posted p
FULL OUTER JOIN held h ON h.account_id = p.account_id
WHERE la.id = coalesce(p.account_id, h.account_id);

COMMIT;

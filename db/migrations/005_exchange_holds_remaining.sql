-- Exchange: holds remaining_amount for partial consumption (orders, withdrawals)
-- Date: 2026-02-05

BEGIN;

ALTER TABLE ex_hold
  ADD COLUMN IF NOT EXISTS remaining_amount numeric(38,18);

UPDATE ex_hold
SET remaining_amount = amount
WHERE remaining_amount IS NULL;

ALTER TABLE ex_hold
  ALTER COLUMN remaining_amount SET NOT NULL;

CREATE OR REPLACE FUNCTION ex_hold_set_remaining_amount()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.remaining_amount IS NULL THEN
    NEW.remaining_amount := NEW.amount;
  END IF;
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'ex_hold_set_remaining_amount_trg'
  ) THEN
    CREATE TRIGGER ex_hold_set_remaining_amount_trg
      BEFORE INSERT ON ex_hold
      FOR EACH ROW
      EXECUTE FUNCTION ex_hold_set_remaining_amount();
  END IF;
END $$;

COMMIT;

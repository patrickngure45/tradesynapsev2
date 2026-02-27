BEGIN;

-- Add explicit lifecycle states for user-requested unwind.
-- 029 created a CHECK constraint for status with an auto-generated name.
-- Here we locate and replace it deterministically.

DO $$
DECLARE
  c_name text;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'trading_bot_execution'::regclass
      AND conname = 'trading_bot_execution_status_check'
  ) THEN
    ALTER TABLE trading_bot_execution DROP CONSTRAINT trading_bot_execution_status_check;
  END IF;

  SELECT conname
  INTO c_name
  FROM pg_constraint
  WHERE conrelid = 'trading_bot_execution'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%status%IN%queued%running%succeeded%failed%canceled%'
  LIMIT 1;

  IF c_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE trading_bot_execution DROP CONSTRAINT %I', c_name);
  END IF;
END $$;

ALTER TABLE trading_bot_execution
  ADD CONSTRAINT trading_bot_execution_status_check
  CHECK (status IN (
    'queued',
    'running',
    'cancel_requested',
    'unwinding',
    'succeeded',
    'failed',
    'canceled'
  ));

COMMIT;

-- Fix: deferred constraint trigger must re-check current row state
-- Date: 2026-02-05

BEGIN;

CREATE OR REPLACE FUNCTION ex_hold_not_active_for_terminal_orders_trg()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  current_status text;
BEGIN
  -- This trigger is DEFERRABLE INITIALLY DEFERRED, so NEW.status reflects the
  -- row state at statement time (e.g. INSERT), not necessarily the final state
  -- at commit. Re-check the current persisted status.
  SELECT h.status INTO current_status
  FROM ex_hold h
  WHERE h.id = NEW.id;

  IF current_status = 'active' THEN
    IF EXISTS (
      SELECT 1
      FROM ex_order o
      WHERE o.hold_id = NEW.id
        AND o.status IN ('filled','canceled')
      LIMIT 1
    ) THEN
      RAISE EXCEPTION 'hold_cannot_be_active_for_terminal_order hold_id=%', NEW.id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMIT;

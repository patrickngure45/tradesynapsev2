-- Exchange invariant: terminal orders must not have active holds
-- Date: 2026-02-05

BEGIN;

CREATE OR REPLACE FUNCTION ex_assert_terminal_order_hold_not_active(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  hold_status text;
  order_status text;
  hold_id uuid;
BEGIN
  SELECT o.status, o.hold_id
    INTO order_status, hold_id
  FROM ex_order o
  WHERE o.id = p_order_id;

  -- If the order disappeared, nothing to validate.
  IF order_status IS NULL THEN
    RETURN;
  END IF;

  IF order_status IN ('filled','canceled') AND hold_id IS NOT NULL THEN
    SELECT h.status INTO hold_status
    FROM ex_hold h
    WHERE h.id = hold_id;

    IF hold_status = 'active' THEN
      RAISE EXCEPTION 'terminal_order_has_active_hold order_id=% hold_id=% status=%', p_order_id, hold_id, order_status;
    END IF;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION ex_order_terminal_hold_invariant_trg()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM ex_assert_terminal_order_hold_not_active(NEW.id);
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'ex_order_terminal_hold_invariant'
  ) THEN
    CREATE CONSTRAINT TRIGGER ex_order_terminal_hold_invariant
      AFTER INSERT OR UPDATE OF status, hold_id ON ex_order
      DEFERRABLE INITIALLY DEFERRED
      FOR EACH ROW
      EXECUTE FUNCTION ex_order_terminal_hold_invariant_trg();
  END IF;
END $$;

CREATE OR REPLACE FUNCTION ex_hold_not_active_for_terminal_orders_trg()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Prevent re-activating a hold that is attached to a terminal order.
  IF NEW.status = 'active' THEN
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

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'ex_hold_terminal_order_invariant'
  ) THEN
    CREATE CONSTRAINT TRIGGER ex_hold_terminal_order_invariant
      AFTER INSERT OR UPDATE OF status ON ex_hold
      DEFERRABLE INITIALLY DEFERRED
      FOR EACH ROW
      EXECUTE FUNCTION ex_hold_not_active_for_terminal_orders_trg();
  END IF;
END $$;

COMMIT;

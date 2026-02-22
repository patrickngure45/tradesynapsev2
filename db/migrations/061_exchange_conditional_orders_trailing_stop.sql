-- Exchange conditional orders: add trailing stop
-- Date: 2026-02-22

BEGIN;

ALTER TABLE ex_conditional_order
  ADD COLUMN IF NOT EXISTS trail_bps int NULL,
  ADD COLUMN IF NOT EXISTS trailing_ref_price numeric(38,18) NULL,
  ADD COLUMN IF NOT EXISTS trailing_stop_price numeric(38,18) NULL,
  ADD COLUMN IF NOT EXISTS activated_at timestamptz NULL;

-- Expand kind support
ALTER TABLE ex_conditional_order
  DROP CONSTRAINT IF EXISTS ex_conditional_order_kind_check,
  ADD CONSTRAINT ex_conditional_order_kind_check CHECK (kind IN ('stop_limit','oco','trailing_stop'));

-- Trail bps constraints
ALTER TABLE ex_conditional_order
  DROP CONSTRAINT IF EXISTS ex_conditional_order_trail_bps_check,
  ADD CONSTRAINT ex_conditional_order_trail_bps_check CHECK (trail_bps IS NULL OR (trail_bps > 0 AND trail_bps <= 10000));

ALTER TABLE ex_conditional_order
  DROP CONSTRAINT IF EXISTS ex_conditional_order_trailing_requires_trail_bps_check,
  ADD CONSTRAINT ex_conditional_order_trailing_requires_trail_bps_check CHECK (
    kind <> 'trailing_stop' OR (trail_bps IS NOT NULL AND trail_bps > 0 AND trail_bps <= 10000)
  );

COMMIT;

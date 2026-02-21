-- Exchange conditional orders: add OCO (one-cancels-the-other)
-- Date: 2026-02-22

BEGIN;

ALTER TABLE ex_conditional_order
  ADD COLUMN IF NOT EXISTS take_profit_price numeric(38,18) NULL,
  ADD COLUMN IF NOT EXISTS triggered_leg text NULL;

-- Normalize constraints (kind + oco requirements)
ALTER TABLE ex_conditional_order
  DROP CONSTRAINT IF EXISTS ex_conditional_order_kind_check,
  ADD CONSTRAINT ex_conditional_order_kind_check CHECK (kind IN ('stop_limit','oco'));

ALTER TABLE ex_conditional_order
  DROP CONSTRAINT IF EXISTS ex_conditional_order_triggered_leg_check,
  ADD CONSTRAINT ex_conditional_order_triggered_leg_check CHECK (triggered_leg IS NULL OR triggered_leg IN ('stop','take_profit'));

ALTER TABLE ex_conditional_order
  DROP CONSTRAINT IF EXISTS ex_conditional_order_take_profit_price_check,
  ADD CONSTRAINT ex_conditional_order_take_profit_price_check CHECK (take_profit_price IS NULL OR take_profit_price > 0);

ALTER TABLE ex_conditional_order
  DROP CONSTRAINT IF EXISTS ex_conditional_order_oco_requires_tp_check,
  ADD CONSTRAINT ex_conditional_order_oco_requires_tp_check CHECK (
    kind <> 'oco' OR (take_profit_price IS NOT NULL AND take_profit_price > 0)
  );

COMMIT;

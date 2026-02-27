-- Add market order support to ex_order
-- Date: 2026-02-07

BEGIN;

-- Expand type check constraint to include 'market'
ALTER TABLE ex_order DROP CONSTRAINT IF EXISTS ex_order_type_check;
ALTER TABLE ex_order ADD CONSTRAINT ex_order_type_check CHECK (type IN ('limit', 'market'));

-- Allow price = 0 for market orders (limit still requires > 0)
ALTER TABLE ex_order DROP CONSTRAINT IF EXISTS ex_order_price_check;
ALTER TABLE ex_order ADD CONSTRAINT ex_order_price_check CHECK (
  (type = 'limit' AND price > 0) OR (type = 'market' AND price >= 0)
);

COMMIT;

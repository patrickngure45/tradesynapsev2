-- Exchange: iceberg orders (display quantity + hidden remainder)
-- Date: 2026-02-22

BEGIN;

ALTER TABLE ex_order
  ADD COLUMN IF NOT EXISTS iceberg_display_quantity numeric(38,18) NULL,
  ADD COLUMN IF NOT EXISTS iceberg_hidden_remaining numeric(38,18) NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ex_order_iceberg_display_positive'
  ) THEN
    ALTER TABLE ex_order
      ADD CONSTRAINT ex_order_iceberg_display_positive
      CHECK (iceberg_display_quantity IS NULL OR iceberg_display_quantity > 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ex_order_iceberg_hidden_nonneg'
  ) THEN
    ALTER TABLE ex_order
      ADD CONSTRAINT ex_order_iceberg_hidden_nonneg
      CHECK (iceberg_hidden_remaining >= 0);
  END IF;
END $$;

COMMIT;

-- Price alerts: add templates beyond simple threshold
-- Date: 2026-02-22

BEGIN;

ALTER TABLE app_price_alert
  ADD COLUMN IF NOT EXISTS template text NOT NULL DEFAULT 'threshold',
  ADD COLUMN IF NOT EXISTS window_sec int NULL,
  ADD COLUMN IF NOT EXISTS pct_change numeric(38,18) NULL,
  ADD COLUMN IF NOT EXISTS spread_bps numeric(38,18) NULL,
  ADD COLUMN IF NOT EXISTS volatility_pct numeric(38,18) NULL,
  ADD COLUMN IF NOT EXISTS last_value numeric(38,18) NULL,
  ADD COLUMN IF NOT EXISTS last_value_at timestamptz NULL;

-- Constrain template values.
ALTER TABLE app_price_alert
  DROP CONSTRAINT IF EXISTS app_price_alert_template_check;

ALTER TABLE app_price_alert
  ADD CONSTRAINT app_price_alert_template_check
  CHECK (template IN ('threshold','pct_change','volatility_spike','spread_widening'));

COMMIT;

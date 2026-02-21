-- Watchlist + price alerts
-- Date: 2026-02-21

BEGIN;

CREATE TABLE IF NOT EXISTS app_watchlist_item (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  base_symbol text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT app_watchlist_item_user_symbol_uniq UNIQUE (user_id, base_symbol)
);

CREATE INDEX IF NOT EXISTS app_watchlist_item_user_created_idx
  ON app_watchlist_item(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS app_price_alert (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  base_symbol text NOT NULL,
  fiat text NOT NULL,
  direction text NOT NULL CHECK (direction IN ('above','below')),
  threshold numeric(38,18) NOT NULL,
  status text NOT NULL CHECK (status IN ('active','paused','deleted')),
  cooldown_sec int NOT NULL DEFAULT 3600,
  last_triggered_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS app_price_alert_user_status_idx
  ON app_price_alert(user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS app_price_alert_active_scan_idx
  ON app_price_alert(status, base_symbol, fiat)
  WHERE status = 'active';

-- Ensure notification types support all types used by code.
ALTER TABLE ex_notification
  DROP CONSTRAINT IF EXISTS ex_notification_type_check;

ALTER TABLE ex_notification
  ADD CONSTRAINT ex_notification_type_check
  CHECK (
    type IN (
      'order_filled',
      'order_partially_filled',
      'order_canceled',
      'deposit_credited',
      'withdrawal_approved',
      'withdrawal_rejected',
      'withdrawal_completed',
      'trade_won',
      'trade_lost',
      'p2p_order_created',
      'p2p_order_expiring',
      'p2p_payment_confirmed',
      'p2p_order_completed',
      'p2p_order_cancelled',
      'p2p_dispute_opened',
      'p2p_dispute_resolved',
      'p2p_feedback_received',
      'arcade_ready',
      'arcade_hint_ready',
      'price_alert',
      'system'
    )
  );

COMMIT;

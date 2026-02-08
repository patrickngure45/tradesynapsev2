-- User notifications
-- Date: 2026-02-06

BEGIN;

CREATE TABLE IF NOT EXISTS ex_notification (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('order_filled', 'order_partially_filled', 'order_canceled', 'deposit_credited', 'withdrawal_approved', 'withdrawal_rejected', 'withdrawal_completed', 'system')),
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  metadata_json jsonb NOT NULL DEFAULT '{}',
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ex_notification_user_created_idx ON ex_notification(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ex_notification_user_unread_idx ON ex_notification(user_id) WHERE read = false;

COMMIT;

-- Per-user notification preferences
-- Date: 2026-02-22

BEGIN;

CREATE TABLE IF NOT EXISTS app_notification_preference (
  user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  type text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, type)
);

CREATE INDEX IF NOT EXISTS app_notification_preference_user_idx
  ON app_notification_preference(user_id);

COMMIT;

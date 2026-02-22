-- Notifications: quiet hours + digest (defer during quiet hours)
-- Date: 2026-02-22

BEGIN;

CREATE TABLE IF NOT EXISTS app_notification_schedule (
  user_id uuid PRIMARY KEY REFERENCES app_user(id) ON DELETE CASCADE,
  quiet_enabled boolean NOT NULL DEFAULT false,
  quiet_start_min int NOT NULL DEFAULT 1320 CHECK (quiet_start_min >= 0 AND quiet_start_min <= 1439),
  quiet_end_min int NOT NULL DEFAULT 480 CHECK (quiet_end_min >= 0 AND quiet_end_min <= 1439),
  tz_offset_min int NOT NULL DEFAULT 0 CHECK (tz_offset_min >= -840 AND tz_offset_min <= 840),
  digest_enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ex_notification_deferred (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  type text NOT NULL,
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  metadata_json jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ex_notification_deferred_user_created_idx
  ON ex_notification_deferred(user_id, created_at ASC);

COMMIT;

-- Notification preferences: per-channel flags (in-app + email)
-- Date: 2026-02-22

BEGIN;

ALTER TABLE app_notification_preference
  ADD COLUMN IF NOT EXISTS in_app_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS email_enabled boolean NOT NULL DEFAULT false;

-- Backfill existing rows.
UPDATE app_notification_preference
SET in_app_enabled = enabled
WHERE in_app_enabled IS DISTINCT FROM enabled;

COMMIT;

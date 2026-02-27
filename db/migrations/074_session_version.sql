-- Session invalidation support (logout all devices)
-- Date: 2026-02-22

BEGIN;

ALTER TABLE app_user
  ADD COLUMN IF NOT EXISTS session_version integer NOT NULL DEFAULT 0;

COMMIT;

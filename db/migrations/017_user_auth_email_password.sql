-- Migration: Add email/password auth to app_user
-- Adds email + password_hash columns for real authentication
-- Also adds a unique index on email for login lookups.

BEGIN;

ALTER TABLE app_user
  ADD COLUMN IF NOT EXISTS email text UNIQUE,
  ADD COLUMN IF NOT EXISTS password_hash text,
  ADD COLUMN IF NOT EXISTS display_name text;

CREATE INDEX IF NOT EXISTS app_user_email_idx ON app_user(email)
  WHERE email IS NOT NULL;

COMMIT;

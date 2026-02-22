-- Password reset tokens
-- Date: 2026-02-22

BEGIN;

CREATE TABLE IF NOT EXISTS app_password_reset_token (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  request_ip text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS app_password_reset_token_user_created_idx
  ON app_password_reset_token(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS app_password_reset_token_expires_idx
  ON app_password_reset_token(expires_at);

COMMIT;

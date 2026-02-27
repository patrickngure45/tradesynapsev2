-- App idempotency keys (used by mutating endpoints that need safe retries)
-- Date: 2026-02-22

BEGIN;

CREATE TABLE IF NOT EXISTS app_idempotency_key (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  scope text NOT NULL,
  idem_key text NOT NULL,
  request_hash text NOT NULL,
  response_json jsonb NULL,
  status_code int NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT app_idempotency_key_user_scope_key_uniq UNIQUE (user_id, scope, idem_key)
);

CREATE INDEX IF NOT EXISTS app_idempotency_key_created_idx
  ON app_idempotency_key(created_at DESC);

COMMIT;

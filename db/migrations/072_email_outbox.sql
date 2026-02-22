-- Email outbox (for notification emails)
-- Date: 2026-02-22

BEGIN;

CREATE TABLE IF NOT EXISTS ex_email_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  to_email text NOT NULL,
  kind text NOT NULL DEFAULT 'notification',
  type text NOT NULL DEFAULT 'system',
  subject text NOT NULL,
  text_body text NOT NULL,
  html_body text NOT NULL DEFAULT '',
  metadata_json jsonb NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sending','sent','failed')),
  attempts int NOT NULL DEFAULT 0,
  last_error text NULL,
  message_id text NULL,
  locked_at timestamptz NULL,
  locked_by text NULL,
  sent_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ex_email_outbox_status_created_idx
  ON ex_email_outbox(status, created_at ASC);

CREATE INDEX IF NOT EXISTS ex_email_outbox_user_created_idx
  ON ex_email_outbox(user_id, created_at DESC);

COMMIT;

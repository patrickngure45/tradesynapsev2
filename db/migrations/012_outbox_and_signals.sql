-- Durable outbox + generic signals table (AI-ready)
-- Date: 2026-02-06

BEGIN;

CREATE TABLE IF NOT EXISTS app_outbox_event (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic text NOT NULL,
  aggregate_type text NULL,
  aggregate_id text NULL,
  payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,

  attempts integer NOT NULL DEFAULT 0,
  last_error text NULL,

  visible_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz NULL,
  lock_id uuid NULL,

  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz NULL
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'app_outbox_event_payload_object_chk'
  ) THEN
    ALTER TABLE app_outbox_event
      ADD CONSTRAINT app_outbox_event_payload_object_chk
      CHECK (jsonb_typeof(payload_json) = 'object');
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS app_outbox_event_pending_idx
  ON app_outbox_event(visible_at ASC, created_at ASC, id ASC)
  WHERE processed_at IS NULL;

CREATE INDEX IF NOT EXISTS app_outbox_event_topic_pending_idx
  ON app_outbox_event(topic, visible_at ASC, created_at ASC, id ASC)
  WHERE processed_at IS NULL;

CREATE INDEX IF NOT EXISTS app_outbox_event_lock_idx
  ON app_outbox_event(locked_at, lock_id)
  WHERE processed_at IS NULL;


CREATE TABLE IF NOT EXISTS app_signal (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_type text NOT NULL,
  subject_id text NOT NULL,
  kind text NOT NULL,

  score numeric NULL,
  recommended_action text NULL,
  model_version text NULL,

  payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'app_signal_payload_object_chk'
  ) THEN
    ALTER TABLE app_signal
      ADD CONSTRAINT app_signal_payload_object_chk
      CHECK (jsonb_typeof(payload_json) = 'object');
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS app_signal_subject_kind_created_idx
  ON app_signal(subject_type, subject_id, kind, created_at DESC);

COMMIT;

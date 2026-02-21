BEGIN;

-- Multi-stage reveal support for arcade actions (hint stage).
-- Date: 2026-02-21

ALTER TABLE arcade_action
  ADD COLUMN IF NOT EXISTS hint_json jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE arcade_action
  ADD COLUMN IF NOT EXISTS hint_revealed_at timestamptz NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'arcade_action_hint_object_chk') THEN
    ALTER TABLE arcade_action
      ADD CONSTRAINT arcade_action_hint_object_chk
      CHECK (jsonb_typeof(hint_json) = 'object');
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS arcade_action_hint_pending_idx
  ON arcade_action(status, resolves_at ASC)
  WHERE status IN ('scheduled','hint_ready');

COMMIT;

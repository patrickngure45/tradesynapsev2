BEGIN;

-- Per-user, per-key state storage for Arcade modules (pity timers, tiers, missions, etc).
-- Date: 2026-02-21

CREATE TABLE IF NOT EXISTS arcade_state (
  user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  key text NOT NULL,
  value_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (user_id, key)
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'arcade_state_value_object_chk') THEN
    ALTER TABLE arcade_state
      ADD CONSTRAINT arcade_state_value_object_chk
      CHECK (jsonb_typeof(value_json) = 'object');
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS arcade_state_user_updated_idx
  ON arcade_state(user_id, updated_at DESC);

COMMIT;

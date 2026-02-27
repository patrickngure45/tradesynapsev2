BEGIN;

-- Arcade consumption log: audit when inventory items (especially boosts) are spent.
-- Date: 2026-02-21

CREATE TABLE IF NOT EXISTS arcade_consumption (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,

  kind text NOT NULL,
  code text NOT NULL,
  rarity text NULL,
  quantity integer NOT NULL DEFAULT 1,

  context_type text NOT NULL,
  context_id text NULL,

  module text NULL,
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'arcade_consumption_metadata_object_chk') THEN
    ALTER TABLE arcade_consumption
      ADD CONSTRAINT arcade_consumption_metadata_object_chk
      CHECK (jsonb_typeof(metadata_json) = 'object');
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS arcade_consumption_user_time_idx
  ON arcade_consumption(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS arcade_consumption_user_kind_code_time_idx
  ON arcade_consumption(user_id, kind, code, created_at DESC);

COMMIT;

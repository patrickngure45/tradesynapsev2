-- Dead-letter support for the outbox
-- Events that exceed max retry attempts are marked dead so they stop
-- being picked up by the worker but remain queryable for admin review.
-- Date: 2026-02-07

BEGIN;

ALTER TABLE app_outbox_event
  ADD COLUMN IF NOT EXISTS dead_lettered_at timestamptz NULL;

-- Fast lookup for admin dead-letter review
CREATE INDEX IF NOT EXISTS app_outbox_event_dead_letter_idx
  ON app_outbox_event(dead_lettered_at DESC)
  WHERE dead_lettered_at IS NOT NULL;

-- Ensure claim queries skip dead-lettered rows (partial index on pending already
-- filters on processed_at IS NULL, but we also exclude dead_lettered rows).
-- Drop + re-create the main pending index to include the dead-letter filter:
DROP INDEX IF EXISTS app_outbox_event_pending_idx;
CREATE INDEX app_outbox_event_pending_idx
  ON app_outbox_event(visible_at ASC, created_at ASC, id ASC)
  WHERE processed_at IS NULL AND dead_lettered_at IS NULL;

DROP INDEX IF EXISTS app_outbox_event_topic_pending_idx;
CREATE INDEX app_outbox_event_topic_pending_idx
  ON app_outbox_event(topic, visible_at ASC, created_at ASC, id ASC)
  WHERE processed_at IS NULL AND dead_lettered_at IS NULL;

COMMIT;

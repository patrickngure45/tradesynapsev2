BEGIN;

-- P2P ad highlight: cosmetic ordering/badge + small utility sink for Arcade boosts.
-- Date: 2026-02-21

ALTER TABLE p2p_ad
  ADD COLUMN IF NOT EXISTS highlighted_until timestamptz NULL;

CREATE INDEX IF NOT EXISTS p2p_ad_highlight_until_idx
  ON p2p_ad(highlighted_until DESC);

COMMIT;

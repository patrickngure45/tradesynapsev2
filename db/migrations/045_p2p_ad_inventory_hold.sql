BEGIN;

-- Backed P2P SELL ads: reserve inventory in an ex_hold so ads are always funded.
-- This prevents "seller_insufficient_funds" failures when takers try to start an order.

ALTER TABLE p2p_ad
  ADD COLUMN IF NOT EXISTS inventory_hold_id uuid NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'p2p_ad_inventory_hold_fk'
  ) THEN
    ALTER TABLE p2p_ad
      ADD CONSTRAINT p2p_ad_inventory_hold_fk
      FOREIGN KEY (inventory_hold_id) REFERENCES ex_hold(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS p2p_ad_inventory_hold_uniq
  ON p2p_ad(inventory_hold_id)
  WHERE inventory_hold_id IS NOT NULL;

-- Backfill existing online SELL ads with an inventory hold.
-- Only creates holds when remaining_amount > 0.
WITH sell_ads AS (
  SELECT id, user_id, asset_id, remaining_amount
  FROM p2p_ad
  WHERE side = 'SELL'
    AND status = 'online'
    AND remaining_amount > 0
    AND inventory_hold_id IS NULL
),
accounts AS (
  INSERT INTO ex_ledger_account (user_id, asset_id)
  SELECT DISTINCT user_id, asset_id
  FROM sell_ads
  ON CONFLICT (user_id, asset_id) DO UPDATE SET user_id = EXCLUDED.user_id
  RETURNING user_id, asset_id, id
),
holds AS (
  INSERT INTO ex_hold (account_id, asset_id, amount, remaining_amount, reason, status)
  SELECT
    a.id,
    s.asset_id,
    (s.remaining_amount::numeric),
    (s.remaining_amount::numeric),
    ('p2p_ad:' || (s.id::text)),
    'active'
  FROM sell_ads s
  JOIN accounts a ON a.user_id = s.user_id AND a.asset_id = s.asset_id
  RETURNING id, reason
)
UPDATE p2p_ad ad
SET inventory_hold_id = h.id
FROM holds h
WHERE h.reason = ('p2p_ad:' || (ad.id::text))
  AND ad.inventory_hold_id IS NULL;

COMMIT;

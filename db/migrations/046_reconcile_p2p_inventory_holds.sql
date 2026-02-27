BEGIN;

-- Reconcile funded P2P SELL ad inventory holds created during backfill.
-- Goal:
-- 1) Never reserve more inventory (sum of inventory holds) than a seller can actually cover.
-- 2) Keep p2p_ad.remaining_amount aligned to the reserved inventory.
--
-- This prevents UI showing negative available and prevents order-create failures.

-- 1) Update the inventory hold remaining_amount to match the allocation
WITH inv AS (
  SELECT
    ad.id AS ad_id,
    ad.remaining_amount::numeric AS ad_remaining,
    ad.updated_at,
    h.id AS hold_id,
    h.account_id
  FROM p2p_ad ad
  JOIN ex_hold h ON h.id = ad.inventory_hold_id
  WHERE ad.side = 'SELL'
    AND ad.status = 'online'
    AND h.status = 'active'
),
posted AS (
  SELECT a.id AS account_id, coalesce(sum(jl.amount), 0)::numeric AS posted
  FROM ex_ledger_account a
  LEFT JOIN ex_journal_line jl ON jl.account_id = a.id
  GROUP BY a.id
),
other_held AS (
  SELECT
    h.account_id,
    coalesce(sum(h.remaining_amount), 0)::numeric AS held
  FROM ex_hold h
  WHERE h.status = 'active'
    AND h.reason NOT LIKE 'p2p_ad:%'
  GROUP BY h.account_id
),
budget AS (
  SELECT
    i.account_id,
    GREATEST(0, p.posted - coalesce(o.held, 0))::numeric AS inventory_budget
  FROM (SELECT DISTINCT account_id FROM inv) i
  JOIN posted p ON p.account_id = i.account_id
  LEFT JOIN other_held o ON o.account_id = i.account_id
),
ranked AS (
  SELECT
    i.*,
    b.inventory_budget,
    sum(i.ad_remaining) OVER (
      PARTITION BY i.account_id
      ORDER BY i.updated_at DESC NULLS LAST, i.ad_id
      ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
    ) AS prior_desired
  FROM inv i
  JOIN budget b ON b.account_id = i.account_id
),
alloc AS (
  SELECT
    r.hold_id,
    GREATEST(
      0,
      LEAST(
        r.ad_remaining,
        (r.inventory_budget - coalesce(r.prior_desired, 0))
      )
    )::numeric AS allocated
  FROM ranked r
)
UPDATE ex_hold h
SET remaining_amount = a.allocated
FROM alloc a
WHERE h.id = a.hold_id
  AND h.status = 'active';

-- 2) Align the ad's remaining_amount to the reserved inventory
WITH inv AS (
  SELECT
    ad.id AS ad_id,
    ad.remaining_amount::numeric AS ad_remaining,
    ad.updated_at,
    h.id AS hold_id,
    h.account_id
  FROM p2p_ad ad
  JOIN ex_hold h ON h.id = ad.inventory_hold_id
  WHERE ad.side = 'SELL'
    AND ad.status = 'online'
    AND h.status = 'active'
),
posted AS (
  SELECT a.id AS account_id, coalesce(sum(jl.amount), 0)::numeric AS posted
  FROM ex_ledger_account a
  LEFT JOIN ex_journal_line jl ON jl.account_id = a.id
  GROUP BY a.id
),
other_held AS (
  SELECT
    h.account_id,
    coalesce(sum(h.remaining_amount), 0)::numeric AS held
  FROM ex_hold h
  WHERE h.status = 'active'
    AND h.reason NOT LIKE 'p2p_ad:%'
  GROUP BY h.account_id
),
budget AS (
  SELECT
    i.account_id,
    GREATEST(0, p.posted - coalesce(o.held, 0))::numeric AS inventory_budget
  FROM (SELECT DISTINCT account_id FROM inv) i
  JOIN posted p ON p.account_id = i.account_id
  LEFT JOIN other_held o ON o.account_id = i.account_id
),
ranked AS (
  SELECT
    i.*,
    b.inventory_budget,
    sum(i.ad_remaining) OVER (
      PARTITION BY i.account_id
      ORDER BY i.updated_at DESC NULLS LAST, i.ad_id
      ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
    ) AS prior_desired
  FROM inv i
  JOIN budget b ON b.account_id = i.account_id
),
alloc AS (
  SELECT
    r.ad_id,
    GREATEST(
      0,
      LEAST(
        r.ad_remaining,
        (r.inventory_budget - coalesce(r.prior_desired, 0))
      )
    )::numeric AS allocated
  FROM ranked r
)
UPDATE p2p_ad ad
SET remaining_amount = a.allocated,
    updated_at = now()
FROM alloc a
WHERE ad.id = a.ad_id;

COMMIT;

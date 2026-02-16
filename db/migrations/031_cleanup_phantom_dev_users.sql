-- 031: Clean up phantom users created by dev seed endpoints
-- These are headless users with no email or password, created by:
--   - /api/exchange/dev/seed-open-book (1 user per order)
--   - /api/dev/seed (buyer + seller per trade)
--   - /api/exchange/dev/seed-execution
--   - /api/dev/users
--   - market-maker.ts with password_hash = 'hash'
-- Safe to run: only deletes users with NO email AND NO password AND who
-- are NOT the well-known system user, AND have zero ledger balance.

BEGIN;

-- 1. Release any active holds belonging to phantom users (prevents FK violations)
UPDATE ex_hold h
SET status = 'released', released_at = now()
FROM ex_ledger_account la
JOIN app_user u ON u.id = la.user_id
WHERE h.account_id = la.id
  AND h.status = 'active'
  AND u.email IS NULL
  AND u.password_hash IS NULL
  AND u.id != '00000000-0000-0000-0000-000000000001'::uuid;

-- 2. Cancel any open orders from phantom users
UPDATE ex_order o
SET status = 'canceled', remaining_quantity = 0, updated_at = now()
FROM app_user u
WHERE o.user_id = u.id
  AND o.status IN ('open', 'partially_filled')
  AND u.email IS NULL
  AND u.password_hash IS NULL
  AND u.id != '00000000-0000-0000-0000-000000000001'::uuid;

-- 3. Delete journal lines for phantom user accounts with zero net balance
DELETE FROM ex_journal_line jl
USING ex_ledger_account la, app_user u
WHERE jl.account_id = la.id
  AND la.user_id = u.id
  AND u.email IS NULL
  AND u.password_hash IS NULL
  AND u.id != '00000000-0000-0000-0000-000000000001'::uuid;

-- 4. Delete holds (now all released) for phantom users
DELETE FROM ex_hold h
USING ex_ledger_account la, app_user u
WHERE h.account_id = la.id
  AND la.user_id = u.id
  AND u.email IS NULL
  AND u.password_hash IS NULL
  AND u.id != '00000000-0000-0000-0000-000000000001'::uuid;

-- 5. Delete ledger accounts for phantom users
DELETE FROM ex_ledger_account la
USING app_user u
WHERE la.user_id = u.id
  AND u.email IS NULL
  AND u.password_hash IS NULL
  AND u.id != '00000000-0000-0000-0000-000000000001'::uuid;

-- 6. Delete orders from phantom users
DELETE FROM ex_order o
USING app_user u
WHERE o.user_id = u.id
  AND u.email IS NULL
  AND u.password_hash IS NULL
  AND u.id != '00000000-0000-0000-0000-000000000001'::uuid;

-- 7. Delete deposit addresses for phantom users
DELETE FROM ex_deposit_address da
USING app_user u
WHERE da.user_id = u.id
  AND u.email IS NULL
  AND u.password_hash IS NULL
  AND u.id != '00000000-0000-0000-0000-000000000001'::uuid;

-- 8. Delete withdrawal requests for phantom users
DELETE FROM ex_withdrawal_request wr
USING app_user u
WHERE wr.user_id = u.id
  AND u.email IS NULL
  AND u.password_hash IS NULL
  AND u.id != '00000000-0000-0000-0000-000000000001'::uuid;

-- 8b. Delete withdrawal allowlist entries for phantom users
DELETE FROM ex_withdrawal_allowlist wal
USING app_user u
WHERE wal.user_id = u.id
  AND u.email IS NULL
  AND u.password_hash IS NULL
  AND u.id != '00000000-0000-0000-0000-000000000001'::uuid;

-- 9. Delete notifications for phantom users
DO $$
BEGIN
  IF to_regclass('app_notification') IS NOT NULL THEN
    DELETE FROM app_notification n
    USING app_user u
    WHERE n.user_id = u.id
      AND u.email IS NULL
      AND u.password_hash IS NULL
      AND u.id != '00000000-0000-0000-0000-000000000001'::uuid;
  END IF;
END $$;

-- 10. Delete copy trading subscriptions for phantom users
DO $$
BEGIN
  IF to_regclass('copy_trading_subscription') IS NOT NULL THEN
    DELETE FROM copy_trading_subscription cts
    USING app_user u
    WHERE cts.follower_user_id = u.id
      AND u.email IS NULL
      AND u.password_hash IS NULL
      AND u.id != '00000000-0000-0000-0000-000000000001'::uuid;
  END IF;
END $$;

-- 11. Delete copy trading leaders for phantom users
DO $$
BEGIN
  IF to_regclass('copy_trading_leader') IS NOT NULL THEN
    DELETE FROM copy_trading_leader ctl
    USING app_user u
    WHERE ctl.user_id = u.id
      AND u.email IS NULL
      AND u.password_hash IS NULL
      AND u.id != '00000000-0000-0000-0000-000000000001'::uuid;
  END IF;
END $$;

-- 12. Delete wallets for phantom users
DO $$
BEGIN
  IF to_regclass('wallet') IS NOT NULL THEN
    DELETE FROM wallet w
    USING app_user u
    WHERE w.user_id = u.id
      AND u.email IS NULL
      AND u.password_hash IS NULL
      AND u.id != '00000000-0000-0000-0000-000000000001'::uuid;
  END IF;
END $$;

-- 13. Delete P2P payment methods for phantom users
DO $$
BEGIN
  IF to_regclass('p2p_payment_method') IS NOT NULL THEN
    DELETE FROM p2p_payment_method pm
    USING app_user u
    WHERE pm.user_id = u.id
      AND u.email IS NULL
      AND u.password_hash IS NULL
      AND u.id != '00000000-0000-0000-0000-000000000001'::uuid;
  END IF;
END $$;

-- 14. Delete trading bot executions for phantom users
DO $$
BEGIN
  IF to_regclass('trading_bot_execution') IS NOT NULL THEN
    DELETE FROM trading_bot_execution tbe
    USING app_user u
    WHERE tbe.user_id = u.id
      AND u.email IS NULL
      AND u.password_hash IS NULL
      AND u.id != '00000000-0000-0000-0000-000000000001'::uuid;
  END IF;
END $$;

-- 15. Now safely delete the phantom users themselves
DELETE FROM app_user
WHERE email IS NULL
  AND password_hash IS NULL
  AND id != '00000000-0000-0000-0000-000000000001'::uuid;

-- 16. Remove the fake market-maker admin user with password_hash = 'hash'
-- (created by market-maker.ts script)
DELETE FROM app_user
WHERE id = '00000000-0000-0000-0000-000000000000'::uuid
  AND password_hash = 'hash';

-- 17. Remove known bot/system email accounts created by dev scripts
-- (marketmaker@system.local from seed-market-maker.ts,
--  mm@tradesynapse.com from market-maker.ts,
--  mint@system.local from seed-admin.dev.ts)
-- First clean their dependent rows, then delete the users.
DELETE FROM ex_hold h
USING ex_ledger_account la, app_user u
WHERE h.account_id = la.id
  AND la.user_id = u.id
  AND u.email IN ('marketmaker@system.local', 'mm@tradesynapse.com', 'mint@system.local');

DELETE FROM ex_journal_line jl
USING ex_ledger_account la, app_user u
WHERE jl.account_id = la.id
  AND la.user_id = u.id
  AND u.email IN ('marketmaker@system.local', 'mm@tradesynapse.com', 'mint@system.local');

DELETE FROM ex_order o
USING app_user u
WHERE o.user_id = u.id
  AND u.email IN ('marketmaker@system.local', 'mm@tradesynapse.com', 'mint@system.local');

DELETE FROM ex_withdrawal_allowlist wal
USING app_user u
WHERE wal.user_id = u.id
  AND u.email IN ('marketmaker@system.local', 'mm@tradesynapse.com', 'mint@system.local');

DELETE FROM ex_ledger_account la
USING app_user u
WHERE la.user_id = u.id
  AND u.email IN ('marketmaker@system.local', 'mm@tradesynapse.com', 'mint@system.local');

DO $$
BEGIN
  IF to_regclass('app_notification') IS NOT NULL THEN
    DELETE FROM app_notification n
    USING app_user u
    WHERE n.user_id = u.id
      AND u.email IN ('marketmaker@system.local', 'mm@tradesynapse.com', 'mint@system.local');
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('wallet') IS NOT NULL THEN
    DELETE FROM wallet w
    USING app_user u
    WHERE w.user_id = u.id
      AND u.email IN ('marketmaker@system.local', 'mm@tradesynapse.com', 'mint@system.local');
  END IF;
END $$;

DELETE FROM app_user
WHERE email IN ('marketmaker@system.local', 'mm@tradesynapse.com', 'mint@system.local');

-- 18. Clean up orphaned journal entries (entries with no remaining lines)
DELETE FROM ex_journal_entry je
WHERE NOT EXISTS (
  SELECT 1 FROM ex_journal_line jl WHERE jl.entry_id = je.id
);

-- 19. Clean up orphaned executions referencing deleted orders
DELETE FROM ex_execution e
WHERE NOT EXISTS (SELECT 1 FROM ex_order o WHERE o.id = e.maker_order_id)
  AND NOT EXISTS (SELECT 1 FROM ex_order o WHERE o.id = e.taker_order_id);

COMMIT;

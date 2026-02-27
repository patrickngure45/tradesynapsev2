-- 032: Remove seed/smoke/demo users and their dependent rows
-- Keeps the known real admin account and the system ledger user.

BEGIN;

CREATE TEMP TABLE _cleanup_target_users AS
SELECT u.id
FROM app_user u
WHERE u.id <> '00000000-0000-0000-0000-000000000001'::uuid
  AND lower(coalesce(u.email, '')) <> 'ngurengure10@gmail.com'
  AND (
    u.email IS NULL
    OR lower(u.email) LIKE '%@test.local'
    OR lower(u.email) LIKE '%@demo.com'
    OR lower(u.email) LIKE 'smoke-%'
    OR lower(u.email) IN (
      'trial@gmail.com',
      'test-debug@test.local',
      'taker@demo.com',
      'marketmaker@system.local',
      'mm@tradesynapse.com',
      'mint@system.local'
    )
  );

DO $$
BEGIN
  IF to_regclass('p2p_chat_message') IS NOT NULL THEN
    EXECUTE 'DELETE FROM p2p_chat_message WHERE sender_id IN (SELECT id FROM _cleanup_target_users)';
  END IF;

  IF to_regclass('p2p_dispute') IS NOT NULL THEN
    EXECUTE 'DELETE FROM p2p_dispute WHERE from_user_id IN (SELECT id FROM _cleanup_target_users) OR to_user_id IN (SELECT id FROM _cleanup_target_users)';
  END IF;

  IF to_regclass('p2p_order') IS NOT NULL THEN
    EXECUTE 'DELETE FROM p2p_order WHERE maker_id IN (SELECT id FROM _cleanup_target_users) OR taker_id IN (SELECT id FROM _cleanup_target_users) OR buyer_id IN (SELECT id FROM _cleanup_target_users) OR seller_id IN (SELECT id FROM _cleanup_target_users)';
  END IF;

  IF to_regclass('p2p_payment_method') IS NOT NULL THEN
    EXECUTE 'DELETE FROM p2p_payment_method WHERE user_id IN (SELECT id FROM _cleanup_target_users)';
  END IF;

  IF to_regclass('copy_trading_subscription') IS NOT NULL THEN
    EXECUTE 'DELETE FROM copy_trading_subscription WHERE follower_user_id IN (SELECT id FROM _cleanup_target_users)';
  END IF;

  IF to_regclass('copy_trading_leader') IS NOT NULL THEN
    EXECUTE 'DELETE FROM copy_trading_leader WHERE user_id IN (SELECT id FROM _cleanup_target_users)';
  END IF;

  IF to_regclass('trading_bot_execution') IS NOT NULL THEN
    EXECUTE 'DELETE FROM trading_bot_execution WHERE user_id IN (SELECT id FROM _cleanup_target_users)';
  END IF;

  IF to_regclass('user_exchange_connection') IS NOT NULL THEN
    EXECUTE 'DELETE FROM user_exchange_connection WHERE user_id IN (SELECT id FROM _cleanup_target_users)';
  END IF;

  IF to_regclass('wallet') IS NOT NULL THEN
    EXECUTE 'DELETE FROM wallet WHERE user_id IN (SELECT id FROM _cleanup_target_users)';
  END IF;

  IF to_regclass('app_notification') IS NOT NULL THEN
    EXECUTE 'DELETE FROM app_notification WHERE user_id IN (SELECT id FROM _cleanup_target_users)';
  END IF;

  IF to_regclass('app_email_verification_token') IS NOT NULL THEN
    EXECUTE 'DELETE FROM app_email_verification_token WHERE user_id IN (SELECT id FROM _cleanup_target_users)';
  END IF;

  IF to_regclass('user_totp') IS NOT NULL THEN
    EXECUTE 'DELETE FROM user_totp WHERE user_id IN (SELECT id FROM _cleanup_target_users)';
  END IF;

  IF to_regclass('app_session') IS NOT NULL THEN
    EXECUTE 'DELETE FROM app_session WHERE user_id IN (SELECT id FROM _cleanup_target_users)';
  END IF;

  IF to_regclass('kyc_submission') IS NOT NULL THEN
    EXECUTE 'DELETE FROM kyc_submission WHERE user_id IN (SELECT id FROM _cleanup_target_users)';
  END IF;

  IF to_regclass('ex_chain_deposit_event') IS NOT NULL THEN
    EXECUTE 'DELETE FROM ex_chain_deposit_event WHERE user_id IN (SELECT id FROM _cleanup_target_users)';
  END IF;
END $$;

-- Exchange data tied to users
DELETE FROM ex_withdrawal_request
WHERE user_id IN (SELECT id FROM _cleanup_target_users);

DELETE FROM ex_withdrawal_allowlist
WHERE user_id IN (SELECT id FROM _cleanup_target_users);

DELETE FROM ex_deposit_address
WHERE user_id IN (SELECT id FROM _cleanup_target_users);

-- Remove executions linked to target users' orders before deleting orders.
DELETE FROM ex_execution e
USING ex_order o
WHERE e.maker_order_id = o.id
  AND o.user_id IN (SELECT id FROM _cleanup_target_users);

DELETE FROM ex_execution e
USING ex_order o
WHERE e.taker_order_id = o.id
  AND o.user_id IN (SELECT id FROM _cleanup_target_users);

DELETE FROM ex_order
WHERE user_id IN (SELECT id FROM _cleanup_target_users);

-- Ledger-linked rows
DELETE FROM ex_journal_line jl
USING ex_ledger_account la
WHERE jl.account_id = la.id
  AND la.user_id IN (SELECT id FROM _cleanup_target_users);

DELETE FROM ex_hold h
USING ex_ledger_account la
WHERE h.account_id = la.id
  AND la.user_id IN (SELECT id FROM _cleanup_target_users);

DELETE FROM ex_ledger_account
WHERE user_id IN (SELECT id FROM _cleanup_target_users);

-- Orphan cleanup
DELETE FROM ex_journal_entry je
WHERE NOT EXISTS (
  SELECT 1 FROM ex_journal_line jl WHERE jl.entry_id = je.id
);

-- Finally delete users
DELETE FROM app_user
WHERE id IN (SELECT id FROM _cleanup_target_users);

DROP TABLE _cleanup_target_users;

COMMIT;

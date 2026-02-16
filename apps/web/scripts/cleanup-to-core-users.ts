import "dotenv/config";

import { getSql } from "../src/lib/db";

const SYSTEM_USER_IDS = [
  "00000000-0000-0000-0000-000000000001", // system/treasury
  "00000000-0000-0000-0000-000000000002", // cap
  "00000000-0000-0000-0000-000000000003", // burn
];

function parseKeepEmails(): string[] {
  const raw = process.env.KEEP_USER_EMAILS?.trim();
  if (!raw) {
    return [
      "ngurengure10@gmail.com",
      "macharialouis4@gmail.com",
      "sallymellow03@gmail.com",
    ];
  }
  return raw
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

async function main() {
  const sql = getSql();
  const keepEmails = parseKeepEmails();

  console.log("[cleanup] keeping emails:", keepEmails.join(", "));

  await sql.begin(async (tx) => {
    const txSql = tx as unknown as typeof sql;

    await txSql`
      CREATE TEMP TABLE _cleanup_target_users AS
      SELECT u.id
      FROM app_user u
      WHERE u.id::text <> ALL(${SYSTEM_USER_IDS}::text[])
        AND lower(coalesce(u.email, '')) <> ALL(${keepEmails}::text[])
    `;

    await txSql`
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
    `;

    await txSql`
      DELETE FROM ex_withdrawal_request
      WHERE user_id IN (SELECT id FROM _cleanup_target_users)
    `;

    await txSql`
      DELETE FROM ex_withdrawal_allowlist
      WHERE user_id IN (SELECT id FROM _cleanup_target_users)
    `;

    await txSql`
      DELETE FROM ex_deposit_address
      WHERE user_id IN (SELECT id FROM _cleanup_target_users)
    `;

    await txSql`
      DELETE FROM ex_execution e
      USING ex_order o
      WHERE e.maker_order_id = o.id
        AND o.user_id IN (SELECT id FROM _cleanup_target_users)
    `;

    await txSql`
      DELETE FROM ex_execution e
      USING ex_order o
      WHERE e.taker_order_id = o.id
        AND o.user_id IN (SELECT id FROM _cleanup_target_users)
    `;

    await txSql`
      DELETE FROM ex_order
      WHERE user_id IN (SELECT id FROM _cleanup_target_users)
    `;

    await txSql`
      DELETE FROM ex_journal_line jl
      USING ex_ledger_account la
      WHERE jl.account_id = la.id
        AND la.user_id IN (SELECT id FROM _cleanup_target_users)
    `;

    await txSql`
      DELETE FROM ex_hold h
      USING ex_ledger_account la
      WHERE h.account_id = la.id
        AND la.user_id IN (SELECT id FROM _cleanup_target_users)
    `;

    await txSql`
      DELETE FROM ex_ledger_account
      WHERE user_id IN (SELECT id FROM _cleanup_target_users)
    `;

    await txSql`
      DELETE FROM ex_journal_entry je
      WHERE NOT EXISTS (
        SELECT 1 FROM ex_journal_line jl WHERE jl.entry_id = je.id
      )
    `;

    await txSql`
      DO $$
      DECLARE
        pass integer := 0;
        affected integer := 0;
        row_count integer := 0;
        ref record;
      BEGIN
        LOOP
          pass := pass + 1;
          affected := 0;

          FOR ref IN
            SELECT
              c.conrelid::regclass AS tbl,
              a.attname AS col
            FROM pg_constraint c
            JOIN pg_attribute a
              ON a.attrelid = c.conrelid
             AND a.attnum = c.conkey[1]
            WHERE c.contype = 'f'
              AND c.confrelid = 'app_user'::regclass
              AND array_length(c.conkey, 1) = 1
          LOOP
            BEGIN
              EXECUTE format(
                'DELETE FROM %s WHERE %I IN (SELECT id FROM _cleanup_target_users)',
                ref.tbl,
                ref.col
              );
              GET DIAGNOSTICS row_count = ROW_COUNT;
              affected := affected + row_count;
            EXCEPTION
              WHEN foreign_key_violation THEN
                NULL;
            END;
          END LOOP;

          EXIT WHEN affected = 0 OR pass >= 8;
        END LOOP;
      END $$;
    `;

    const deletedUsers = await txSql<{ count: string }[]>`
      WITH d AS (
        DELETE FROM app_user
        WHERE id IN (SELECT id FROM _cleanup_target_users)
        RETURNING id
      )
      SELECT count(*)::text AS count FROM d
    `;

    const remaining = await txSql<{ email: string }[]>`
      SELECT lower(email) AS email
      FROM app_user
      WHERE email IS NOT NULL
        AND password_hash IS NOT NULL
      ORDER BY email ASC
    `;

    console.log(`[cleanup] deleted users: ${deletedUsers[0]?.count ?? "0"}`);
    console.log(`[cleanup] remaining email+password users: ${remaining.length}`);
    console.table(remaining.map((row) => ({ email: row.email })));
  });
}

main().catch((error) => {
  console.error("[cleanup-to-core-users] failed:", error);
  process.exit(1);
});

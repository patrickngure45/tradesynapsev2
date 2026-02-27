import "dotenv/config";

import { getSql } from "../src/lib/db";

const SYSTEM_USER_IDS = [
  "00000000-0000-0000-0000-000000000001", // system/treasury
  "00000000-0000-0000-0000-000000000002", // cap
  "00000000-0000-0000-0000-000000000003", // burn
];

function parseKeepEmails(): string[] {
  const raw = process.env.KEEP_USER_EMAILS?.trim();
  if (!raw) return [];
  return raw
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

function shouldExecute(): boolean {
  return String(process.env.CONFIRM_CLEANUP ?? "").trim() === "DELETE_DEV_USERS";
}

async function main() {
  const sql = getSql();
  const keepEmails = parseKeepEmails();
  const execute = shouldExecute();

  console.log(`[cleanup-dev-users] mode: ${execute ? "EXECUTE" : "DRY_RUN"}`);
  if (!execute) {
    console.log("[cleanup-dev-users] To actually delete, set CONFIRM_CLEANUP=DELETE_DEV_USERS");
  }
  if (keepEmails.length > 0) {
    console.log("[cleanup-dev-users] keeping emails:", keepEmails.join(", "));
  }

  await sql.begin(async (tx) => {
    const txSql = tx as unknown as typeof sql;

    // Target: any non-system user that does NOT have a password set.
    // Assumption (per ops): real users have email + password (and usually phone).
    await txSql`
      CREATE TEMP TABLE _cleanup_target_users AS
      SELECT u.id, lower(u.email) AS email, u.created_at
      FROM app_user u
      WHERE u.id::text <> ALL(${SYSTEM_USER_IDS}::text[])
        AND u.password_hash IS NULL
        AND (
          ${keepEmails.length} = 0
          OR lower(coalesce(u.email, '')) <> ALL(${keepEmails}::text[])
        )
    `;

    const targetCount = await txSql<{ n: string }[]>`
      SELECT count(*)::text AS n FROM _cleanup_target_users
    `;

    const sample = await txSql<{ id: string; email: string | null; created_at: string }[]>`
      SELECT id::text AS id, email, created_at::text AS created_at
      FROM _cleanup_target_users
      ORDER BY created_at DESC, id
      LIMIT 25
    `;

    console.log(`[cleanup-dev-users] target users (no password): ${targetCount[0]?.n ?? "0"}`);
    if (sample.length > 0) {
      console.log("[cleanup-dev-users] sample targets (max 25):");
      console.table(sample.map((r) => ({ id: r.id, email: r.email ?? "", created_at: r.created_at })));
    }

    if (!execute) return;

    // P2P
    await txSql`
      DO $$
      BEGIN
        IF to_regclass('p2p_chat_message') IS NOT NULL THEN
          EXECUTE 'DELETE FROM p2p_chat_message WHERE sender_id IN (SELECT id FROM _cleanup_target_users)';
        END IF;

        IF to_regclass('p2p_dispute') IS NOT NULL THEN
          -- Disputes are attached to orders; delete any dispute for a targeted user's orders
          -- and any dispute opened by a targeted user.
          EXECUTE '
            DELETE FROM p2p_dispute d
            USING p2p_order o
            WHERE d.order_id = o.id
              AND (o.maker_id IN (SELECT id FROM _cleanup_target_users)
                OR o.taker_id IN (SELECT id FROM _cleanup_target_users)
                OR o.buyer_id IN (SELECT id FROM _cleanup_target_users)
                OR o.seller_id IN (SELECT id FROM _cleanup_target_users))
          ';
          EXECUTE 'DELETE FROM p2p_dispute WHERE opened_by_user_id IN (SELECT id FROM _cleanup_target_users)';
        END IF;

        IF to_regclass('p2p_order') IS NOT NULL THEN
          EXECUTE 'DELETE FROM p2p_order WHERE maker_id IN (SELECT id FROM _cleanup_target_users) OR taker_id IN (SELECT id FROM _cleanup_target_users) OR buyer_id IN (SELECT id FROM _cleanup_target_users) OR seller_id IN (SELECT id FROM _cleanup_target_users)';
        END IF;

        IF to_regclass('p2p_ad') IS NOT NULL THEN
          EXECUTE 'DELETE FROM p2p_ad WHERE user_id IN (SELECT id FROM _cleanup_target_users)';
        END IF;

        IF to_regclass('p2p_payment_method') IS NOT NULL THEN
          EXECUTE 'DELETE FROM p2p_payment_method WHERE user_id IN (SELECT id FROM _cleanup_target_users)';
        END IF;

        -- Arcade/dev seed tables
        IF to_regclass('arcade_action') IS NOT NULL THEN
          EXECUTE 'DELETE FROM arcade_action WHERE user_id IN (SELECT id FROM _cleanup_target_users)';
        END IF;

        -- Legacy MVP trade tables (dev seed route)
        IF to_regclass('trade_state_transition') IS NOT NULL THEN
          EXECUTE 'DELETE FROM trade_state_transition WHERE actor_user_id IN (SELECT id FROM _cleanup_target_users)';
        END IF;

        IF to_regclass('risk_assessment') IS NOT NULL THEN
          EXECUTE 'DELETE FROM risk_assessment WHERE trade_id IN (SELECT id FROM trade WHERE buyer_user_id IN (SELECT id FROM _cleanup_target_users) OR seller_user_id IN (SELECT id FROM _cleanup_target_users))';
        END IF;

        IF to_regclass('trade') IS NOT NULL THEN
          EXECUTE 'DELETE FROM trade WHERE buyer_user_id IN (SELECT id FROM _cleanup_target_users) OR seller_user_id IN (SELECT id FROM _cleanup_target_users)';
        END IF;

        IF to_regclass('message') IS NOT NULL THEN
          -- MVP schema uses sender_user_id.
          EXECUTE 'DELETE FROM message WHERE sender_user_id IN (SELECT id FROM _cleanup_target_users)';
        END IF;

        IF to_regclass('evidence_object') IS NOT NULL THEN
          EXECUTE '
            DELETE FROM evidence_object
            WHERE submitted_by_user_id IN (SELECT id FROM _cleanup_target_users)
          ';
          EXECUTE '
            DELETE FROM evidence_object eo
            USING trade t
            WHERE eo.trade_id = t.id
              AND (t.buyer_user_id IN (SELECT id FROM _cleanup_target_users)
                OR t.seller_user_id IN (SELECT id FROM _cleanup_target_users))
          ';
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

    // Exchange
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

    // IMPORTANT:
    // Do NOT delete exchange ledger/journal history here.
    // The ledger uses balancing triggers that will fail if lines are removed.
    // Instead we "tombstone" the user record below and remove user-facing rows (ads, orders, sessions, etc.).

    // Generic single-column FKs to app_user
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

    const tombstoned = await txSql<{ count: string }[]>`
      WITH u AS (
        UPDATE app_user
        SET
          status = 'banned',
          kyc_level = 'none',
          email = NULL,
          display_name = NULL,
          password_hash = NULL
        WHERE id IN (SELECT id FROM _cleanup_target_users)
        RETURNING id
      )
      SELECT count(*)::text AS count FROM u
    `;

    console.log(`[cleanup-dev-users] tombstoned users: ${tombstoned[0]?.count ?? "0"}`);
  });
}

main().catch((error) => {
  console.error("[cleanup-dev-users] failed:", error);
  process.exit(1);
});

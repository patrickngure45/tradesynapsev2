import "dotenv/config";

import { getSql } from "../src/lib/db";

const SYSTEM_USER_IDS = [
  "00000000-0000-0000-0000-000000000001",
  "00000000-0000-0000-0000-000000000002",
  "00000000-0000-0000-0000-000000000003",
] as const;

const APPLY = process.argv.includes("--apply") || process.env.APPLY === "1";

async function main() {
  const sql = getSql();

  const admins = await sql<{ id: string; email: string }[]>`
    SELECT id::text as id, email
    FROM app_user
    WHERE role = 'admin'
      AND status = 'active'
      AND email IS NOT NULL
    ORDER BY created_at ASC
  `;

  if (admins.length !== 1) {
    throw new Error(`Expected exactly 1 active admin with email; found ${admins.length}`);
  }

  const adminId = admins[0]!.id;
  const adminEmail = admins[0]!.email;

  const nonAdminUsers = await sql<{ id: string; email: string; role: string; status: string }[]>`
    SELECT id::text as id, email, role, status
    FROM app_user
    WHERE email IS NOT NULL
      AND status = 'active'
      AND role <> 'admin'
      AND id <> ${adminId}::uuid
      AND id NOT IN (${SYSTEM_USER_IDS[0]}::uuid, ${SYSTEM_USER_IDS[1]}::uuid, ${SYSTEM_USER_IDS[2]}::uuid)
    ORDER BY lower(email) ASC
  `;

  const nonAdminIds = nonAdminUsers.map((u) => u.id);

  // Find any journal entries that touch non-admin ledger accounts.
  const entryIds = nonAdminIds.length
    ? await sql<{ id: string }[]>`
        SELECT DISTINCT jl.entry_id::text as id
        FROM ex_journal_line jl
        JOIN ex_ledger_account la ON la.id = jl.account_id
        WHERE la.user_id::text = ANY(${nonAdminIds})
      `
    : [];

  const entryIdList = entryIds.map((r) => r.id);

  // Preview counts for what would be removed.
  const preview = await sql<
    {
      non_admin_users: number;
      journal_entries_to_delete: number;
      journal_lines_to_delete: number;
      holds_to_delete: number;
      orders_to_delete: number;
      withdrawals_to_delete: number;
      deposit_addresses_to_delete: number;
      chain_txs_to_delete: number;
      ledger_accounts_to_delete: number;
    }[]
  >`
    WITH non_admin AS (
      SELECT unnest(${nonAdminIds}::text[])::uuid AS id
    ), non_admin_accounts AS (
      SELECT la.id
      FROM ex_ledger_account la
      JOIN non_admin u ON u.id = la.user_id
    ), touched_entries AS (
      SELECT DISTINCT jl.entry_id
      FROM ex_journal_line jl
      JOIN non_admin_accounts a ON a.id = jl.account_id
    )
    SELECT
      (SELECT count(*) FROM non_admin)::int AS non_admin_users,
      (SELECT count(*) FROM touched_entries)::int AS journal_entries_to_delete,
      (SELECT count(*) FROM ex_journal_line jl JOIN touched_entries te ON te.entry_id = jl.entry_id)::int AS journal_lines_to_delete,
      (SELECT count(*) FROM ex_hold h JOIN non_admin_accounts a ON a.id = h.account_id)::int AS holds_to_delete,
      (SELECT count(*) FROM ex_order o JOIN non_admin u ON u.id = o.user_id)::int AS orders_to_delete,
      (SELECT count(*) FROM ex_withdrawal_request w JOIN non_admin u ON u.id = w.user_id)::int AS withdrawals_to_delete,
      (SELECT count(*) FROM ex_deposit_address d JOIN non_admin u ON u.id = d.user_id)::int AS deposit_addresses_to_delete,
      (SELECT count(*) FROM ex_chain_tx t JOIN non_admin u ON u.id = t.user_id)::int AS chain_txs_to_delete,
      (SELECT count(*) FROM non_admin_accounts)::int AS ledger_accounts_to_delete
  `;

  console.log(
    JSON.stringify(
      {
        apply: APPLY,
        admin: { id: adminId, email: adminEmail },
        nonAdminUsers,
        entryIdsSample: entryIdList.slice(0, 10),
        preview: preview[0] ?? null,
      },
      null,
      2,
    ),
  );

  if (!APPLY) {
    console.log("\nDry-run only. Re-run with --apply to delete non-admin exchange state.");
    await sql.end({ timeout: 5 });
    return;
  }

  if (nonAdminIds.length === 0) {
    console.log("\nNo non-admin active users with email found. Nothing to do.");
    await sql.end({ timeout: 5 });
    return;
  }

  await sql.begin(async (tx) => {
    // Remove user-scoped objects first.
    await tx`DELETE FROM ex_order WHERE user_id::text = ANY(${nonAdminIds})`;
    await tx`DELETE FROM ex_withdrawal_request WHERE user_id::text = ANY(${nonAdminIds})`;
    await tx`DELETE FROM ex_deposit_address WHERE user_id::text = ANY(${nonAdminIds})`;
    await tx`DELETE FROM ex_chain_tx WHERE user_id::text = ANY(${nonAdminIds})`;

    // Remove holds for non-admin accounts.
    await tx`
      DELETE FROM ex_hold h
      USING ex_ledger_account la
      WHERE la.id = h.account_id
        AND la.user_id::text = ANY(${nonAdminIds})
    `;

    // Delete any journal entries that touched non-admin accounts (must delete whole entries to keep balancing).
    if (entryIdList.length) {
      await tx`DELETE FROM ex_journal_line WHERE entry_id::text = ANY(${entryIdList})`;
      await tx`DELETE FROM ex_journal_entry WHERE id::text = ANY(${entryIdList})`;
    }

    // Finally remove ledger accounts.
    await tx`DELETE FROM ex_ledger_account WHERE user_id::text = ANY(${nonAdminIds})`;
  });

  console.log("\n[reset-nonadmin-exchange-state] Applied.");
  await sql.end({ timeout: 5 });
}

main().catch((e) => {
  console.error("[reset-nonadmin-exchange-state] Failed:", e);
  process.exit(1);
});

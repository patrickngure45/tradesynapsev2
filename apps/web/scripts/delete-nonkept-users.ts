import "dotenv/config";

import { getSql } from "../src/lib/db";

type EmailUserRow = { id: string; email: string; status: string; role: string };

const KEEP_EMAILS = [
  "ngurengure10@gmail.com",
  "sallymellow03@gmail.com",
  "macharialouis4@gmail.com",
  "anthalamuziq@gmail.com",
].map((s) => s.toLowerCase());

const SYSTEM_USER_IDS = [
  "00000000-0000-0000-0000-000000000001",
  "00000000-0000-0000-0000-000000000002",
  "00000000-0000-0000-0000-000000000003",
];

function shouldApply(): boolean {
  return process.env.APPLY === "1";
}

async function main() {
  console.log("[delete-nonkept-users] start");
  const sql = getSql();

  const users = await sql<EmailUserRow[]>`
    SELECT id::text AS id, email, status, role
    FROM app_user
    WHERE email IS NOT NULL
    ORDER BY lower(email) ASC
  `;

  const keep = users.filter((u: EmailUserRow) => KEEP_EMAILS.includes(u.email.toLowerCase()));
  const toDelete = users.filter((u: EmailUserRow) => !KEEP_EMAILS.includes(u.email.toLowerCase()));

  const missing = KEEP_EMAILS.filter((e) => !keep.some((u: EmailUserRow) => u.email.toLowerCase() === e));
  if (missing.length) {
    console.error("[delete-nonkept-users] Missing keep emails in DB:", missing);
    process.exit(1);
  }

  console.log(
    JSON.stringify(
      {
        apply: shouldApply(),
        keepEmails: KEEP_EMAILS,
        keepUsers: keep.map((u: EmailUserRow) => ({ id: u.id, email: u.email, status: u.status, role: u.role })),
        deleteUsers: toDelete.map((u: EmailUserRow) => ({ id: u.id, email: u.email, status: u.status, role: u.role })),
        counts: { keep: keep.length, delete: toDelete.length, totalEmailUsers: users.length },
      },
      null,
      2,
    ),
  );

  if (!shouldApply()) {
    console.log("\nDry-run only. Re-run with APPLY=1 to delete the non-kept users.");
    process.exit(0);
  }

  const deleteIds = toDelete.map((u: EmailUserRow) => u.id);

  await sql.begin(async (tx: typeof sql) => {
    if (deleteIds.length) {
      // Remove user-owned rows first (safe, even if empty)
      await tx`DELETE FROM p2p_payment_method WHERE user_id::text = ANY(${deleteIds})`;
      await tx`DELETE FROM kyc_submission WHERE user_id::text = ANY(${deleteIds})`;

      // Orders/withdrawals/deposits (if present)
      await tx`DELETE FROM ex_order WHERE user_id::text = ANY(${deleteIds})`;
      await tx`DELETE FROM ex_withdrawal_request WHERE user_id::text = ANY(${deleteIds})`;
      await tx`DELETE FROM ex_deposit_address WHERE user_id::text = ANY(${deleteIds})`;

      // Ledger accounts (expected 0 for these users; delete anyway)
      await tx`DELETE FROM ex_ledger_account WHERE user_id::text = ANY(${deleteIds})`;

      // Internal chain txs (optional cleanup)
      await tx`DELETE FROM ex_chain_tx WHERE user_id::text = ANY(${deleteIds})`;

      // Finally delete users
      await tx`DELETE FROM app_user WHERE id::text = ANY(${deleteIds})`;
    }

    // Ensure the kept users are active (agents)
    await tx`
      UPDATE app_user
      SET status = 'active'
      WHERE lower(email) = ANY(${KEEP_EMAILS})
    `;

    // Ensure system users remain active
    await tx`
      UPDATE app_user
      SET status = 'active'
      WHERE id::text = ANY(${SYSTEM_USER_IDS})
    `;
  });

  console.log("\n[delete-nonkept-users] Applied: deleted non-kept email users and activated keep set.");
  process.exit(0);
}

main().catch((err) => {
  console.error("[delete-nonkept-users] Failed:", err);
  process.exit(1);
});

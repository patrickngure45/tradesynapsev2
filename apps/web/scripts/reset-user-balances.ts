import "dotenv/config";

import { getSql } from "../src/lib/db";

const SYSTEM_TREASURY_USER_ID = "00000000-0000-0000-0000-000000000001";

function parseCsv(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function shouldExecute(): boolean {
  return String(process.env.CONFIRM_CLEANUP ?? "").trim() === "RESET_USER_BALANCES";
}

type TargetUser = {
  id: string;
  email: string;
};

type AccountRow = {
  account_id: string;
  asset_id: string;
  chain: string;
  symbol: string;
  posted: string;
  held: string;
};

function asNumericString(n: number): string {
  const fixed = n.toFixed(18).replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
  return fixed.length ? fixed : "0";
}

async function ensureLedgerAccount(sql: any, userId: string, assetId: string): Promise<string> {
  const rows = await sql<{ id: string }[]>`
    INSERT INTO ex_ledger_account (user_id, asset_id)
    VALUES (${userId}::uuid, ${assetId}::uuid)
    ON CONFLICT (user_id, asset_id) DO UPDATE SET user_id = EXCLUDED.user_id
    RETURNING id::text AS id
  `;
  return rows[0]!.id;
}

async function main() {
  const sql = getSql();
  const execute = shouldExecute();

  const emails = parseCsv(process.env.EMAILS);
  if (emails.length === 0) {
    throw new Error("Set EMAILS=comma,separated list of user emails to reset");
  }

  console.log(`[reset-user-balances] mode: ${execute ? "EXECUTE" : "DRY_RUN"}`);
  if (!execute) {
    console.log("[reset-user-balances] To apply, set CONFIRM_CLEANUP=RESET_USER_BALANCES");
  }
  console.log("[reset-user-balances] target emails:", emails.join(", "));

  const targets = await sql<TargetUser[]>`
    SELECT id::text AS id, lower(email) AS email
    FROM app_user
    WHERE email IS NOT NULL
      AND lower(email) = ANY(${emails})
    ORDER BY email ASC
  `;

  const missing = emails.filter((e) => !targets.some((t) => t.email === e));
  if (missing.length > 0) {
    console.warn("[reset-user-balances] ⚠️ missing emails:", missing);
  }
  if (targets.length === 0) {
    console.log("[reset-user-balances] No matching users.");
    return;
  }

  for (const user of targets) {
    const rows = await sql<AccountRow[]>`
      WITH accts AS (
        SELECT la.id AS account_id, asset.id AS asset_id, asset.chain, asset.symbol
        FROM ex_ledger_account la
        JOIN ex_asset asset ON asset.id = la.asset_id
        WHERE la.user_id = ${user.id}::uuid
      ),
      posted AS (
        SELECT account_id, coalesce(sum(amount), 0)::numeric AS posted
        FROM ex_journal_line
        GROUP BY account_id
      ),
      held AS (
        SELECT account_id, coalesce(sum(remaining_amount), 0)::numeric AS held
        FROM ex_hold
        WHERE status = 'active'
        GROUP BY account_id
      )
      SELECT
        accts.account_id::text AS account_id,
        accts.asset_id::text AS asset_id,
        accts.chain,
        accts.symbol,
        coalesce(posted.posted, 0)::text AS posted,
        coalesce(held.held, 0)::text AS held
      FROM accts
      LEFT JOIN posted ON posted.account_id = accts.account_id
      LEFT JOIN held ON held.account_id = accts.account_id
      ORDER BY accts.chain ASC, accts.symbol ASC
    `;

    const nonZero = rows.filter((r) => Math.abs(Number(r.posted)) > 1e-12 || Math.abs(Number(r.held)) > 1e-12);

    console.log("\n────────────────────────────────────────────────────────────");
    console.log(`[user] ${user.email} (${user.id})`);
    if (nonZero.length === 0) {
      console.log("[user] balances already zero (posted=0, held=0)");
      continue;
    }

    console.table(
      nonZero.map((r) => ({
        chain: r.chain,
        symbol: r.symbol,
        posted: r.posted,
        held: r.held,
        available: asNumericString(Number(r.posted) - Number(r.held)),
      })),
    );

    if (!execute) continue;

    await sql.begin(async (tx: any) => {
      // 1) Cancel any pending withdrawals for this user (prevents holds from being recreated)
      await tx`
        UPDATE ex_withdrawal_request
        SET status = 'rejected', updated_at = now()
        WHERE user_id = ${user.id}::uuid
          AND status IN ('requested','approved','broadcast_pending')
      `;

      // 2) Release all active holds for this user's accounts
      await tx`
        UPDATE ex_hold h
        SET status = 'released', released_at = now()
        FROM ex_ledger_account la
        WHERE h.account_id = la.id
          AND la.user_id = ${user.id}::uuid
          AND h.status = 'active'
      `;

      // 3) Move posted balances back to treasury via a balanced journal entry.
      const entry = await tx<{ id: string }[]>`
        INSERT INTO ex_journal_entry (type, reference, metadata_json)
        VALUES (
          'admin_reset_user_balances',
          ${`reset:${user.email}`},
          jsonb_build_object(
            'user_id', ${user.id}::text,
            'email', ${user.email}::text
          )
        )
        RETURNING id::text AS id
      `;
      const entryId = entry[0]!.id;

      for (const r of rows) {
        const posted = Number(r.posted);
        if (!Number.isFinite(posted) || Math.abs(posted) < 1e-12) continue;

        const sysAccountId = await ensureLedgerAccount(tx, SYSTEM_TREASURY_USER_ID, r.asset_id);

        // Bring user to 0: add -posted to user, +posted to system.
        await tx`
          INSERT INTO ex_journal_line (entry_id, account_id, asset_id, amount)
          VALUES
            (${entryId}::uuid, ${r.account_id}::uuid, ${r.asset_id}::uuid, (${asNumericString(-posted)}::numeric)),
            (${entryId}::uuid, ${sysAccountId}::uuid, ${r.asset_id}::uuid, (${asNumericString(posted)}::numeric))
        `;
      }
    });

    console.log("[user] reset applied.");
  }

  console.log("\n[reset-user-balances] done.");
}

main().catch((err) => {
  console.error("[reset-user-balances] failed:", err);
  process.exit(1);
});

/// <reference types="node" />

import "dotenv/config";

import { getSql } from "../src/lib/db";

function requiredEnv(name: string): string {
  const v = (process.env[name] ?? "").trim();
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

async function main() {
  const email = requiredEnv("EMAIL").toLowerCase();
  const sql = getSql();

  const user = await sql<{ id: string }[]>`
    SELECT id::text AS id
    FROM app_user
    WHERE lower(email) = ${email}
    ORDER BY created_at DESC
    LIMIT 1
  `;

  const userId = user[0]?.id ?? null;
  if (!userId) {
    console.log(JSON.stringify({ ok: false, error: "user_not_found", email }, null, 2));
    await sql.end();
    return;
  }

  const [wd, ord, p2p] = await Promise.all([
    sql<{ id: string }[]>`
      SELECT id::text AS id
      FROM ex_withdrawal_request
      WHERE user_id = ${userId}::uuid
      ORDER BY created_at DESC
      LIMIT 1
    `,
    sql<{ id: string }[]>`
      SELECT id::text AS id
      FROM ex_order
      WHERE user_id = ${userId}::uuid
      ORDER BY created_at DESC
      LIMIT 1
    `,
    sql<{ id: string }[]>`
      SELECT id::text AS id
      FROM p2p_order
      WHERE buyer_id = ${userId}::uuid OR seller_id = ${userId}::uuid OR maker_id = ${userId}::uuid OR taker_id = ${userId}::uuid
      ORDER BY created_at DESC
      LIMIT 1
    `,
  ]);

  console.log(
    JSON.stringify(
      {
        ok: true,
        email,
        userId,
        sample: {
          withdrawalId: wd[0]?.id ?? null,
          orderId: ord[0]?.id ?? null,
          p2pOrderId: p2p[0]?.id ?? null,
        },
      },
      null,
      2,
    ),
  );

  await sql.end();
}

main().catch((err) => {
  console.error("[get-sample-ids] failed:", err);
  process.exit(1);
});

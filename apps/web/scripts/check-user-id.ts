/// <reference types="node" />

import "dotenv/config";

import { getSql } from "../src/lib/db";

async function main() {
  const userId = (process.env.CHECK_USER_ID ?? "").trim();
  if (!userId) {
    console.error("Set CHECK_USER_ID=<uuid>");
    process.exit(1);
  }

  const sql = getSql();
  const rows = await sql<{ status: string }[]>`
    SELECT status
    FROM app_user
    WHERE id = ${userId}
    LIMIT 1
  `;

  console.log(
    JSON.stringify(
      {
        userId,
        exists: rows.length > 0,
        status: rows[0]?.status ?? null,
      },
      null,
      2,
    ),
  );

  await sql.end();
}

main().catch((err) => {
  console.error("[check-user-id] failed:", err);
  process.exit(1);
});

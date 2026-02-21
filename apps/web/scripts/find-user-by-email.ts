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

  const rows = await sql<
    {
      id: string;
      email: string | null;
      role: string | null;
      status: string | null;
      created_at: string;
    }[]
  >`
    SELECT id::text AS id, email, role, status, created_at::text AS created_at
    FROM app_user
    WHERE lower(email) = ${email}
    ORDER BY created_at DESC
    LIMIT 5
  `;

  console.log(
    JSON.stringify(
      {
        ok: true,
        email,
        found: rows.length,
        users: rows,
      },
      null,
      2,
    ),
  );

  await sql.end();
}

main().catch((err) => {
  console.error("[find-user-by-email] failed:", err);
  process.exit(1);
});

import "dotenv/config";

import { getSql } from "../src/lib/db";

type Row = {
  id: string;
  display_name: string | null;
  status: string;
  role: string;
  country: string | null;
  kyc_level: string;
  created_at: string;
};

async function main() {
  const sql = getSql();

  const rows = await sql<Row[]>`
    SELECT
      id::text AS id,
      display_name,
      status,
      coalesce(role, 'user') AS role,
      country,
      kyc_level,
      created_at::text AS created_at
    FROM app_user
    WHERE email IS NULL
    ORDER BY created_at ASC
  `;

  console.log(JSON.stringify({ ok: true, count: rows.length, users: rows }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

import "dotenv/config";

import { getSql } from "../src/lib/db";

type Row = {
  id: string;
  email: string | null;
  status: string;
  role: string | null;
  email_verified: boolean | null;
  has_password: boolean;
  created_at: string;
};

async function main() {
  const sql = getSql();

  const rows = await sql<Row[]>`
    SELECT
      id::text AS id,
      email,
      status,
      role,
      email_verified,
      (password_hash IS NOT NULL) AS has_password,
      created_at::text AS created_at
    FROM app_user
    WHERE email IS NOT NULL
      AND id NOT IN (
        '00000000-0000-0000-0000-000000000001'::uuid,
        '00000000-0000-0000-0000-000000000002'::uuid,
        '00000000-0000-0000-0000-000000000003'::uuid
      )
    ORDER BY lower(email)
  `;

  // Do NOT print password_hash. Only derived booleans.
  console.log(
    JSON.stringify(
      {
        ok: true,
        count: rows.length,
        users: rows.map((r) => ({
          id: r.id,
          email: r.email,
          status: r.status,
          role: r.role,
          email_verified: r.email_verified,
          has_password: r.has_password,
          created_at: r.created_at,
        })),
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

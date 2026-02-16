import "dotenv/config";

import { getSql } from "../src/lib/db";
import { hashPassword } from "../src/lib/auth/password";

const KEEP_USERS = [
  { email: "ngurengure10@gmail.com", role: "admin" as const },
  { email: "sallymellow03@gmail.com", role: "user" as const },
  { email: "macharialouis4@gmail.com", role: "user" as const },
  { email: "anthalamuziq@gmail.com", role: "user" as const },
];

function usernameFromEmail(email: string): string {
  return email.split("@")[0]!.trim().toLowerCase();
}

async function main() {
  const sql = getSql();

  try {
    const existing = await sql<{ email: string; id: string; role: string }[]>`
      SELECT id::text as id, email, role
      FROM app_user
      WHERE lower(email) = ANY(${KEEP_USERS.map((u) => u.email.toLowerCase())})
    `;

    const existingLower = new Set(existing.map((u) => u.email.toLowerCase()));
    const missing = KEEP_USERS.filter((u) => !existingLower.has(u.email.toLowerCase()));

    for (const user of missing) {
      const initialPassword = usernameFromEmail(user.email);
      const passwordHash = await hashPassword(initialPassword);
      const displayName = initialPassword;

      await sql`
        INSERT INTO app_user (email, password_hash, display_name, status, kyc_level, role, country)
        VALUES (
          ${user.email.toLowerCase()},
          ${passwordHash},
          ${displayName},
          'active',
          'full',
          ${user.role},
          NULL
        )
        ON CONFLICT (email)
        DO UPDATE SET
          status = 'active',
          kyc_level = 'full',
          role = EXCLUDED.role,
          display_name = COALESCE(app_user.display_name, EXCLUDED.display_name),
          password_hash = COALESCE(app_user.password_hash, EXCLUDED.password_hash)
      `;
    }

    // Ensure the keep users are active/full even if they already existed.
    await sql`
      UPDATE app_user
      SET status = 'active', kyc_level = 'full'
      WHERE lower(email) = ANY(${KEEP_USERS.map((u) => u.email.toLowerCase())})
    `;

    const final = await sql<{ id: string; email: string; status: string; kyc_level: string; role: string }[]>`
      SELECT id::text as id, email, status, kyc_level, role
      FROM app_user
      WHERE lower(email) = ANY(${KEEP_USERS.map((u) => u.email.toLowerCase())})
      ORDER BY lower(email)
    `;

    console.log(
      JSON.stringify(
        {
          created: missing.map((u) => u.email.toLowerCase()),
          note: "Initial password for created users is the email username (local-part before @).",
          users: final,
        },
        null,
        2,
      ),
    );
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((e) => {
  console.error("[ensure-keep-users] Failed:", e);
  process.exit(1);
});

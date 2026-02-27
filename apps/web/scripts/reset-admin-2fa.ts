/// <reference types="node" />

import "dotenv/config";

import { getSql } from "../src/lib/db";

function requiredEnv(name: string): string {
  const v = (process.env[name] ?? "").trim();
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function optionalEnv(name: string): string | null {
  const v = (process.env[name] ?? "").trim();
  return v || null;
}

async function main() {
  const email = requiredEnv("EMAIL").toLowerCase();
  const confirm = optionalEnv("CONFIRM_RESET_2FA");

  if (confirm !== "RESET_2FA") {
    console.log(
      JSON.stringify(
        {
          ok: false,
          error: "confirmation_required",
          message: "Set CONFIRM_RESET_2FA=RESET_2FA to proceed",
        },
        null,
        2,
      ),
    );
    process.exit(1);
  }

  const sql = getSql();

  // Find the user
  const user = await sql<{ id: string; email: string }[]>`
    SELECT id::text AS id, email
    FROM app_user
    WHERE lower(email) = ${email}
    LIMIT 1
  `;

  if (user.length === 0) {
    console.error(`[reset-admin-2fa] User not found: ${email}`);
    process.exit(1);
  }

  const userId = user[0]!.id;

  console.log(`[reset-admin-2fa] Resetting 2FA for ${email} (${userId})...`);

  // Reset 2FA
  await sql`
    UPDATE app_user
    SET totp_secret = NULL, totp_enabled = FALSE, totp_backup_codes = NULL
    WHERE id = ${userId}::uuid
  `;

  console.log(
    JSON.stringify(
      {
        ok: true,
        email,
        userId,
        message: "2FA disabled. User can re-enable it next login.",
      },
      null,
      2,
    ),
  );

  await sql.end();
}

main().catch((err) => {
  console.error("[reset-admin-2fa] failed:", err);
  process.exit(1);
});

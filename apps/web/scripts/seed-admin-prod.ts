import "dotenv/config";
import { getSql } from "../src/lib/db";
import { hashPassword } from "../src/lib/auth/password";

function requiredEnv(name: string): string | null {
  const v = process.env[name];
  return v && v.trim().length ? v.trim() : null;
}

async function main() {
  const email = requiredEnv("ADMIN_EMAIL");
  const password = requiredEnv("ADMIN_PASSWORD");
  const displayName = requiredEnv("ADMIN_DISPLAY_NAME") ?? "Admin";

  // Optional script: do nothing unless configured.
  if (!email || !password) {
    console.log("[seed-admin-prod] ADMIN_EMAIL/ADMIN_PASSWORD not set; skipping.");
    process.exit(0);
  }

  const sql = getSql();
  console.log(`[seed-admin-prod] Ensuring admin user: ${email}`);

  const passwordHash = await hashPassword(password);

  await sql`
    INSERT INTO app_user (email, password_hash, display_name, status, kyc_level, role)
    VALUES (${email.toLowerCase()}, ${passwordHash}, ${displayName}, 'active', 'full', 'admin')
    ON CONFLICT (email)
    DO UPDATE SET
      password_hash = EXCLUDED.password_hash,
      display_name = EXCLUDED.display_name,
      status = 'active',
      kyc_level = 'full',
      role = 'admin'
  `;

  console.log("[seed-admin-prod] Admin user ready.");
  process.exit(0);
}

main().catch((err) => {
  console.error("[seed-admin-prod] Failed:", err);
  process.exit(1);
});

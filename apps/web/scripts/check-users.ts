// Check Users and Roles
import "dotenv/config";

import { getSql } from "../src/lib/db";

async function main() {
  const sql = getSql();
  console.log("🔍 Checking Users and Roles...");

  try {
    const users = await sql`
      SELECT id, email, role, kyc_level, created_at
      FROM app_user
      ORDER BY created_at DESC
      LIMIT 10
    `;

    if (users.length === 0) {
      console.log("⚠️ No users found in database.");
    } else {
      console.table(users.map(u => ({
          Email: u.email,
          Role: u.role,
          KYC: u.kyc_level,
          ID: u.id
      })));
    }
  } catch (err) {
    console.error("Error:", err);
  }
  process.exit(0);
}

main();

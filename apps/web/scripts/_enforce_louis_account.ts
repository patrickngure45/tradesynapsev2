import "dotenv/config";
import { getSql } from "../src/lib/db";

async function main() {
  const sql = getSql();

  const userId = "9303cc31-4320-4de8-b5ed-759f6bab6033";
  const fullName = "Louis Wachira";
  const mpesa = "0796439512";

  const kycConstraint = await sql<{ def: string }[]>`
    SELECT pg_get_constraintdef(oid) AS def
    FROM pg_constraint
    WHERE conrelid = 'app_user'::regclass
      AND contype = 'c'
      AND conname ILIKE '%kyc_level%'
    LIMIT 1
  `;
  const def = String(kycConstraint[0]?.def ?? "").toLowerCase();
  const topKyc = def.includes("'verified'") ? "verified" : def.includes("'full'") ? "full" : "basic";

  const hasEmailVerifiedCol = await sql<{ exists: boolean }[]>`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='app_user' AND column_name='email_verified'
    ) AS exists
  `;

  if (hasEmailVerifiedCol[0]?.exists) {
    await sql`
      UPDATE app_user
      SET display_name = ${fullName}, status='active', kyc_level=${topKyc}, email_verified=true
      WHERE id = ${userId}::uuid
    `;
  } else {
    await sql`
      UPDATE app_user
      SET display_name = ${fullName}, status='active', kyc_level=${topKyc}
      WHERE id = ${userId}::uuid
    `;
  }

  await sql`
    UPDATE p2p_payment_method
    SET is_enabled = false
    WHERE user_id = ${userId}::uuid
      AND lower(identifier) = 'mpesa'
      AND is_enabled = true
  `;

  await sql`
    INSERT INTO p2p_payment_method (user_id, identifier, name, details, is_enabled)
    VALUES (
      ${userId}::uuid,
      'mpesa',
      ${`M-Pesa (${fullName})`},
      ${sql.json({
        phoneNumber: mpesa,
        accountName: fullName,
        verifiedAgent: true,
        network: "Safaricom",
      })}::jsonb,
      true
    )
  `;

  const verify = await sql<{
    id: string;
    email: string | null;
    display_name: string | null;
    status: string;
    kyc_level: string;
    email_verified: boolean | null;
  }[]>`
    SELECT
      id::text AS id,
      email,
      display_name,
      status,
      kyc_level,
      ${hasEmailVerifiedCol[0]?.exists ? sql`email_verified` : sql`NULL::boolean`} AS email_verified
    FROM app_user
    WHERE id = ${userId}::uuid
    LIMIT 1
  `;

  console.log(JSON.stringify({ ok: true, topKyc, user: verify[0] ?? null }, null, 2));
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

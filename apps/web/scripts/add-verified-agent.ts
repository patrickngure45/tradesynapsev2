import "dotenv/config";

import { getSql } from "../src/lib/db";
import { hashPassword } from "../src/lib/auth/password";

function parseArgs(argv: string[]) {
  const args = new Map<string, string | boolean>();
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i] ?? "";
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next != null && !next.startsWith("--")) {
      args.set(key, next);
      i++;
    } else {
      args.set(key, true);
    }
  }

  const email = String(args.get("email") ?? "").trim().toLowerCase();
  const fullName = String(args.get("name") ?? "").trim();
  const phone = String(args.get("phone") ?? "").trim();
  const password = String(args.get("password") ?? "").trim();
  const network = String(args.get("network") ?? "Safaricom").trim();

  if (!email) throw new Error("missing --email");
  if (!fullName) throw new Error("missing --name");
  if (!phone) throw new Error("missing --phone");

  const username = (email.split("@")[0] ?? "").trim();

  const finalPassword = password || username;
  if (finalPassword.length < 1) throw new Error("password resolved to empty");

  return { email, fullName, phone, finalPassword, network };
}

async function main() {
  const { email, fullName, phone, finalPassword, network } = parseArgs(process.argv);

  const sql = getSql();

  const passwordHash = await hashPassword(finalPassword);

  const userRows = await sql<{ id: string; email: string | null }[]>`
    INSERT INTO app_user (email, password_hash, display_name, status, kyc_level, role, email_verified)
    VALUES (
      ${email},
      ${passwordHash},
      ${fullName},
      'active',
      'full',
      'user',
      true
    )
    ON CONFLICT (email)
    DO UPDATE SET
      status = 'active',
      kyc_level = 'full',
      role = 'user',
      display_name = EXCLUDED.display_name,
      email_verified = true,
      password_hash = COALESCE(app_user.password_hash, EXCLUDED.password_hash)
    RETURNING id::text AS id, email
  `;

  const userId = userRows[0]!.id;

  // Disable any existing enabled mpesa methods for this user.
  await sql`
    UPDATE p2p_payment_method
    SET is_enabled = false
    WHERE user_id = ${userId}::uuid
      AND lower(identifier) = 'mpesa'
      AND is_enabled = true
  `;

  // Insert a fresh, enabled verified-agent mpesa method.
  await sql`
    INSERT INTO p2p_payment_method (user_id, identifier, name, details, is_enabled)
    VALUES (
      ${userId}::uuid,
      'mpesa',
      ${`M-Pesa (${fullName})`},
      ${sql.json({
        phoneNumber: phone,
        accountName: fullName,
        verifiedAgent: true,
        network,
      })}::jsonb,
      true
    )
  `;

  const verify = await sql<
    {
      id: string;
      email: string | null;
      display_name: string | null;
      status: string;
      kyc_level: string;
      role: string | null;
      email_verified: boolean | null;
      phone_number: string | null;
      account_name: string | null;
      verified_agent: boolean;
    }[]
  >`
    SELECT
      u.id::text AS id,
      u.email,
      u.display_name,
      u.status,
      u.kyc_level,
      u.role,
      u.email_verified,
      NULLIF(pm.details->>'phoneNumber', '') AS phone_number,
      NULLIF(pm.details->>'accountName', '') AS account_name,
      ((pm.details->>'verifiedAgent')::text = 'true') AS verified_agent
    FROM app_user u
    JOIN p2p_payment_method pm ON pm.user_id = u.id
    WHERE u.id = ${userId}::uuid
      AND pm.is_enabled = true
      AND lower(pm.identifier) = 'mpesa'
    ORDER BY pm.created_at DESC
    LIMIT 1
  `;

  console.log(
    JSON.stringify(
      {
        ok: true,
        createdOrUpdated: {
          email,
          userId,
          displayName: fullName,
          kyc_level: "full",
          email_verified: true,
        },
        mpesa: verify[0] ?? null,
        login: {
          email,
          // Per your rule: password is local-part of email unless overridden.
          password: finalPassword,
        },
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

import "dotenv/config";

import { getSql } from "../src/lib/db";

type UserRow = {
  id: string;
  email: string;
  role: string | null;
  status: string;
};

type MpesaRow = {
  user_id: string;
  id: string;
  identifier: string;
  name: string;
  is_enabled: boolean;
  details: unknown;
  created_at: string;
};

function maskPhone(raw: string): string {
  const s = raw.trim();
  if (s.length <= 4) return "****";
  return `${"*".repeat(Math.max(4, s.length - 3))}${s.slice(-3)}`;
}

function pickPhone(details: any): string | null {
  if (!details || typeof details !== "object") return null;
  const candidates = [
    details.phone,
    details.phoneNumber,
    details.msisdn,
    details.number,
    details.mpesaNumber,
    details.account,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c.trim();
  }
  return null;
}

async function main() {
  const sql = getSql();

  const users = await sql<UserRow[]>`
    SELECT id::text AS id, lower(email) AS email, role, status
    FROM app_user
    WHERE status = 'active'
      AND email IS NOT NULL
      AND lower(email) <> 'ngurengure10@gmail.com'
    ORDER BY lower(email)
  `;

  const mpesa = await sql<MpesaRow[]>`
    SELECT
      pm.user_id::text AS user_id,
      pm.id::text AS id,
      pm.identifier,
      pm.name,
      pm.is_enabled,
      pm.details,
      pm.created_at::text AS created_at
    FROM p2p_payment_method pm
    WHERE pm.is_enabled = true
      AND lower(pm.identifier) = 'mpesa'
    ORDER BY pm.created_at DESC
  `;

  const mpesaByUser = new Map<string, MpesaRow[]>();
  for (const row of mpesa) {
    const arr = mpesaByUser.get(row.user_id) ?? [];
    arr.push(row);
    mpesaByUser.set(row.user_id, arr);
  }

  const report = users.map((u) => {
    const methods = mpesaByUser.get(u.id) ?? [];
    const phoneRaw = methods.length > 0 ? pickPhone((methods[0] as any).details) : null;
    return {
      email: u.email,
      user_id: u.id,
      role: u.role ?? "user",
      mpesa_methods: methods.length,
      mpesa_phone_present: Boolean(phoneRaw),
      mpesa_phone_masked: phoneRaw ? maskPhone(phoneRaw) : null,
    };
  });

  console.log(JSON.stringify({ ok: true, users: report }, null, 2));

  await sql.end({ timeout: 5 }).catch(() => undefined);
}

main().catch((err) => {
  console.error("report-mpesa-by-user failed:", err);
  process.exit(1);
});

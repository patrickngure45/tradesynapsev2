import "dotenv/config";

import { getSql } from "../src/lib/db";

type AgentRow = {
  user_id: string;
  email: string | null;
  display_name: string | null;
  status: string;
  role: string;
  identifier: string;
  is_enabled: boolean;
  phone_number: string | null;
  account_name: string | null;
  created_at: string;
};

async function main() {
  const sql = getSql();

  // “Real agents” are inferred from payment methods that explicitly mark verifiedAgent.
  // This avoids hardcoded usernames/emails in source control.
  const rows = await sql<AgentRow[]>`
    SELECT
      u.id::text AS user_id,
      u.email,
      u.display_name,
      u.status,
      coalesce(u.role, 'user') AS role,
      pm.identifier,
      pm.is_enabled,
      NULLIF(pm.details->>'phoneNumber', '') AS phone_number,
      NULLIF(pm.details->>'accountName', '') AS account_name,
      pm.created_at::text AS created_at
    FROM p2p_payment_method pm
    JOIN app_user u ON u.id = pm.user_id
    WHERE pm.is_enabled = true
      AND lower(pm.identifier) = 'mpesa'
      AND (pm.details->>'verifiedAgent')::text = 'true'
    ORDER BY pm.created_at DESC
  `;

  const emails = rows.map((r) => r.email).filter((e): e is string => typeof e === "string" && e.length > 0);
  console.log(
    JSON.stringify(
      {
        ok: true,
        count: rows.length,
        emails,
        agents: rows,
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

import "dotenv/config";

import { getSql } from "../src/lib/db";

const SYSTEM_USER_IDS = new Set([
  "00000000-0000-0000-0000-000000000001",
  "00000000-0000-0000-0000-000000000002",
  "00000000-0000-0000-0000-000000000003",
]);

function parseCsvEnv(name: string): string[] {
  const raw = process.env[name];
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function shouldApply(): boolean {
  return process.env.APPLY === "1";
}

/**
 * Goal: keep exactly 4 *real* users (plus system users).
 *
 * Safety: this script is intentionally conservative.
 *
 * Provide KEEP_REAL_USER_EMAILS as a comma-separated list of real user emails
 * to keep (in addition to the earliest active admin user and system users).
 */
async function main() {
  const sql = getSql();

  const keepEmailsFromEnv = parseCsvEnv("KEEP_REAL_USER_EMAILS").map((e) => e.toLowerCase());
  if (keepEmailsFromEnv.length === 0) {
    console.error(
      "[prune-users] KEEP_REAL_USER_EMAILS is required (comma-separated). Refusing to guess default keep emails."
    );
    process.exit(1);
  }

  const adminRows = await sql<{ id: string; email: string | null }[]>`
    SELECT id::text AS id, email
    FROM app_user
    WHERE role = 'admin' AND status = 'active'
    ORDER BY created_at ASC
    LIMIT 1
  `;
  const admin = adminRows[0] ?? null;
  if (!admin) {
    console.error("[prune-users] No active admin user found; aborting.");
    process.exit(1);
  }

  const keepEmails = keepEmailsFromEnv;

  // Resolve keep user IDs
  const keepRows = await sql<{ id: string; email: string | null; role: string; status: string }[]>`
    SELECT id::text AS id, email, role, status
    FROM app_user
    WHERE lower(email) = ANY(${keepEmails})
  `;

  const keepIds = new Set<string>([...SYSTEM_USER_IDS, admin.id]);
  for (const r of keepRows) keepIds.add(r.id);

  // Fetch current real users (email != null)
  const users = await sql<{ id: string; email: string; role: string; status: string }[]>`
    SELECT id::text AS id, email, role, status
    FROM app_user
    WHERE email IS NOT NULL
    ORDER BY (role = 'admin') DESC, email ASC
  `;

  const toDisable = users.filter((u) => !keepIds.has(u.id));
  const toKeep = users.filter((u) => keepIds.has(u.id));

  console.log(
    JSON.stringify(
      {
        apply: shouldApply(),
        keepEmails,
        keepRealUsers: toKeep.map((u) => ({ email: u.email, role: u.role, id: u.id })),
        disableRealUsers: toDisable.map((u) => ({ email: u.email, role: u.role, id: u.id })),
        counts: {
          realUsersTotal: users.length,
          realUsersKeep: toKeep.length,
          realUsersDisable: toDisable.length,
          systemUsersAlwaysKept: Array.from(SYSTEM_USER_IDS),
        },
      },
      null,
      2,
    ),
  );

  if (!shouldApply()) {
    console.log(
      "\nDry-run only. To apply: set APPLY=1 (and optionally KEEP_REAL_USER_EMAILS=comma,separated,emails) and re-run.",
    );
    process.exit(0);
  }

  await sql.begin(async (tx) => {
    // Disable non-kept real users
    const keepIdArr = Array.from(keepIds);
    await tx`
      UPDATE app_user
      SET status = 'restricted'
      WHERE email IS NOT NULL
        AND NOT (id::text = ANY(${keepIdArr}))
    `;

    // Disable their P2P payment methods too
    await tx`
      UPDATE p2p_payment_method
      SET is_enabled = false
      WHERE NOT (user_id::text = ANY(${keepIdArr}))
    `;
  });

  console.log("\n[prune-users] Applied: disabled non-kept real users.");
  process.exit(0);
}

main().catch((err) => {
  console.error("[prune-users] Failed:", err);
  process.exit(1);
});

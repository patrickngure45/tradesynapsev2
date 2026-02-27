import "dotenv/config";

import { getSql } from "../src/lib/db";

type UserRow = {
  id: string;
  email: string | null;
  status: string;
  role: string;
  created_at: string;
};

function parseCsvEnv(name: string): string[] {
  const raw = process.env[name];
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function maskEmail(email: string): string {
  const trimmed = email.trim();
  const at = trimmed.indexOf("@");
  if (at <= 0) return "***";
  const local = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1);

  const maskPart = (part: string, keepStart = 2) => {
    if (!part) return "***";
    if (part.length <= keepStart) return `${part[0] ?? "*"}***`;
    return `${part.slice(0, keepStart)}***`;
  };

  const domainParts = domain.split(".");
  const domainName = domainParts[0] ?? "";
  const tld = domainParts.length > 1 ? domainParts.slice(1).join(".") : "";

  const maskedLocal = maskPart(local, 2);
  const maskedDomain = tld ? `${maskPart(domainName, 1)}.${tld}` : maskPart(domainName, 1);
  return `${maskedLocal}@${maskedDomain}`;
}

async function main() {
  const sql = getSql();

  const showFull = process.env.SHOW_FULL_EMAILS === "1";
  const expectedEmails = new Set(parseCsvEnv("EXPECTED_EMAILS").map((e) => e.toLowerCase()));

  const rows = await sql<UserRow[]>`
    SELECT id::text AS id, email, status, coalesce(role, 'user') AS role, created_at::text AS created_at
    FROM app_user
    ORDER BY created_at ASC
  `;

  const usersWithEmail = rows
    .map((r) => ({ email: r.email, role: r.role, status: r.status }))
    .filter((r): r is { email: string; role: string; status: string } => typeof r.email === "string" && r.email.length > 0);

  const normalizedEmails = usersWithEmail.map((u) => u.email.toLowerCase());

  const roleCounts = rows.reduce<Record<string, number>>((acc, r) => {
    const key = (r.role || "user").toLowerCase();
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  const statusCounts = rows.reduce<Record<string, number>>((acc, r) => {
    const key = (r.status || "unknown").toLowerCase();
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  const unexpectedEmails = expectedEmails.size
    ? normalizedEmails.filter((e) => !expectedEmails.has(e))
    : [];
  const expectedFoundCount = expectedEmails.size
    ? normalizedEmails.filter((e) => expectedEmails.has(e)).length
    : 0;

  const emails = usersWithEmail.map((u) => (showFull ? u.email : maskEmail(u.email)));
  const unexpectedEmailsOut = unexpectedEmails
    .slice(0, 50)
    .map((e) => (showFull ? e : maskEmail(e)));

  console.log(
    JSON.stringify(
      {
        ok: true,
        totalUsers: rows.length,
        usersWithEmail: usersWithEmail.length,
        roleCounts,
        statusCounts,
        showFullEmails: showFull,
        expectedEmailsProvided: expectedEmails.size,
        expectedFoundCount,
        unexpectedUsersWithEmail: unexpectedEmails.length,
        hasUnexpectedUsersWithEmail: unexpectedEmails.length > 0,
        unexpectedEmails: unexpectedEmailsOut,
        emails,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

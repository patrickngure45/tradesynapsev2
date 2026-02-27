import { apiError } from "@/lib/api/errors";
import { getSql } from "@/lib/db";
import { requireAdminForApi } from "@/lib/auth/admin";

import { POST as runDigest } from "@/app/api/cron/notifications-digest/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const sql = getSql();
  const admin = await requireAdminForApi(sql, request);
  if (!admin.ok) return admin.response;

  const secret = String(process.env.EXCHANGE_CRON_SECRET ?? process.env.CRON_SECRET ?? "").trim();
  if (!secret) return apiError("cron_secret_not_configured", { status: 500 });

  // Invoke the cron handler directly (no network), with server-side auth header.
  const req = new Request("http://internal/api/cron/notifications-digest", {
    method: "POST",
    headers: { "x-cron-secret": secret },
  });
  return await runDigest(req);
}

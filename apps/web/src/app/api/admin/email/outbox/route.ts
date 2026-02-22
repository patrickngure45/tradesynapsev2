import { NextResponse } from "next/server";

import { apiError } from "@/lib/api/errors";
import { requireAdminForApi } from "@/lib/auth/admin";
import { requireAdminKey } from "@/lib/auth/keys";
import { getSql } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isMissingOutboxTable(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.toLowerCase().includes("ex_email_outbox") && msg.toLowerCase().includes("does not exist");
}

export async function GET(request: Request) {
  const sql = getSql();

  const providedAdminKey = (request.headers.get("x-admin-key") ?? "").trim();
  if (providedAdminKey) {
    const key = requireAdminKey(request);
    if (!key.ok) return apiError(key.error);
  } else {
    const admin = await requireAdminForApi(sql, request);
    if (!admin.ok) return admin.response;
  }

  try {
    const countsRows = await sql<
      Array<{ pending: number; sending: number; sent: number; failed: number }>
    >`
      SELECT
        count(*) FILTER (WHERE status = 'pending')::int AS pending,
        count(*) FILTER (WHERE status = 'sending')::int AS sending,
        count(*) FILTER (WHERE status = 'sent')::int AS sent,
        count(*) FILTER (WHERE status = 'failed')::int AS failed
      FROM ex_email_outbox
    `;

    const recentFailed = await sql<
      Array<{ id: string; to_email: string; subject: string; attempts: number; last_error: string | null; updated_at: string }>
    >`
      SELECT
        id::text AS id,
        to_email,
        subject,
        attempts,
        last_error,
        updated_at::text AS updated_at
      FROM ex_email_outbox
      WHERE status = 'failed'
      ORDER BY updated_at DESC
      LIMIT 10
    `;

    const row = countsRows[0] ?? { pending: 0, sending: 0, sent: 0, failed: 0 };
    return NextResponse.json({
      ok: true,
      missing: false,
      counts: row,
      recent_failed: recentFailed,
    });
  } catch (e) {
    if (isMissingOutboxTable(e)) {
      return NextResponse.json({
        ok: true,
        missing: true,
        counts: { pending: 0, sending: 0, sent: 0, failed: 0 },
        recent_failed: [],
      });
    }

    return apiError("internal_error", { details: e instanceof Error ? e.message : String(e) });
  }
}

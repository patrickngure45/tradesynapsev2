import { z } from "zod";
import { NextResponse } from "next/server";

import { apiError, apiZodError } from "@/lib/api/errors";
import { requireAdminForApi } from "@/lib/auth/admin";
import { auditContextFromRequest, writeAuditLog } from "@/lib/auditLog";
import { getSql } from "@/lib/db";
import { responseForDbError, retryOnceOnTransientDbError } from "@/lib/dbTransient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LOCK_KEYS = [
  "exchange:conditional-orders:enqueue",
  "exchange:recurring-buys",
  "exchange:outbox-worker",
  "exchange:scan-deposits:bsc",
  "exchange:finalize-deposits:bsc",
  "exchange:sweep-deposits:bsc",
  "exchange:twap",
] as const;

const postSchema = z.object({
  key: z.enum(LOCK_KEYS),
});

export async function POST(request: Request) {
  const sql = getSql();
  const admin = await requireAdminForApi(sql, request);
  if (!admin.ok) return admin.response;

  const json = await request.json().catch(() => ({}));
  let input: z.infer<typeof postSchema>;
  try {
    input = postSchema.parse(json);
  } catch (e) {
    return apiZodError(e) ?? apiError("invalid_input");
  }

  try {
    const out = await retryOnceOnTransientDbError(async () => {
      return await sql.begin(async (tx) => {
        const txSql = tx as unknown as typeof sql;

        const prevRows = await txSql<
          { key: string; holder_id: string; held_until: string; updated_at: string }[]
        >`
          SELECT
            key,
            holder_id,
            held_until::text AS held_until,
            updated_at::text AS updated_at
          FROM ex_job_lock
          WHERE key = ${input.key}
          LIMIT 1
          FOR UPDATE
        `;
        const prev = prevRows[0] ?? null;
        if (!prev) return null;

        const rows = await txSql<
          {
            key: string;
            holder_id: string;
            held_until: string;
            updated_at: string;
          }[]
        >`
          UPDATE ex_job_lock
          SET held_until = now(), updated_at = now()
          WHERE key = ${input.key}
          RETURNING key, holder_id, held_until::text AS held_until, updated_at::text AS updated_at
        `;
        const updated = rows[0] ?? null;
        if (!updated) return null;

        const ctx = auditContextFromRequest(request);
        await writeAuditLog(txSql as any, {
          actorId: admin.userId,
          actorType: "admin",
          action: "admin.cron.lock.released",
          resourceType: "job_lock",
          resourceId: input.key,
          ip: ctx.ip,
          userAgent: ctx.userAgent,
          requestId: ctx.requestId,
          detail: {
            key: input.key,
            prev,
            updated,
          },
        });

        return updated;
      });
    });

    if (!out) return NextResponse.json({ ok: false, error: "lock_not_found" }, { status: 404 });
    return NextResponse.json({ ok: true, released: true, lock: out }, { status: 200 });
  } catch (e) {
    const resp = responseForDbError("exchange.admin.cron.locks.release", e);
    if (resp) return resp;
    return apiError("internal_error");
  }
}
